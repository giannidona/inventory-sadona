import { createHash } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";

export type ApiScope = "public" | "private" | "write";

// public < private < write: cada scope incluye todo lo del anterior
const SCOPE_RANK: Record<ApiScope, number> = { public: 0, private: 1, write: 2 };

type ApiKeyRecord = { id: string; name: string; scope: ApiScope };

// ---------------------------------------------------------------------------
// Respuestas
// ---------------------------------------------------------------------------

function corsHeaders(request: Request): Record<string, string> {
  const allowed = (process.env.API_CORS_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  const origin = request.headers.get("origin");
  if (!origin || allowed.length === 0) return {};
  if (!allowed.includes("*") && !allowed.includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": allowed.includes("*") ? "*" : origin,
    "Access-Control-Allow-Headers": "Authorization, X-API-Key, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    Vary: "Origin",
  };
}

export function apiJson(
  request: Request,
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {}
): Response {
  return Response.json(body, {
    status: init.status ?? 200,
    headers: {
      "Cache-Control": "private, no-store",
      ...corsHeaders(request),
      ...init.headers,
    },
  });
}

export function apiError(
  request: Request,
  status: number,
  code: string,
  message: string,
  headers?: Record<string, string>
): Response {
  return apiJson(request, { error: { code, message } }, { status, headers });
}

export function apiOptions(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

// ---------------------------------------------------------------------------
// Autenticación (Authorization: Bearer <key>  |  X-API-Key: <key>)
// ---------------------------------------------------------------------------

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function extractKey(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return request.headers.get("x-api-key")?.trim() || null;
}

// Rate limit en memoria (ventana fija de 1 min por key). Es "best effort":
// en serverless cada instancia lleva su propio contador.
const RATE_LIMITS: Record<ApiScope, number> = { public: 120, private: 300, write: 300 };
const windows = new Map<string, { start: number; count: number }>();

function checkRateLimit(key: ApiKeyRecord): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const w = windows.get(key.id);
  if (!w || now - w.start >= 60_000) {
    windows.set(key.id, { start: now, count: 1 });
    return { ok: true, retryAfter: 0 };
  }
  w.count += 1;
  if (w.count > RATE_LIMITS[key.scope]) {
    return { ok: false, retryAfter: Math.ceil((60_000 - (now - w.start)) / 1000) };
  }
  return { ok: true, retryAfter: 0 };
}

const lastTouched = new Map<string, number>();

/**
 * Valida la key y el scope requerido. Devuelve la key o una Response de error
 * lista para retornar.
 */
export async function authenticate(
  request: Request,
  required: ApiScope = "public"
): Promise<{ key: ApiKeyRecord } | { response: Response }> {
  const raw = extractKey(request);
  if (!raw) {
    return {
      response: apiError(
        request,
        401,
        "missing_api_key",
        "Falta la API key. Enviala como 'Authorization: Bearer <key>' o 'X-API-Key'.",
        { "WWW-Authenticate": "Bearer" }
      ),
    };
  }

  const supabase = createServiceClient();
  const { data } = await supabase
    .from("api_keys")
    .select("id, name, scope")
    .eq("key_hash", hashApiKey(raw))
    .is("revoked_at", null)
    .maybeSingle();

  if (!data) {
    return {
      response: apiError(request, 401, "invalid_api_key", "API key inválida o revocada.", {
        "WWW-Authenticate": "Bearer",
      }),
    };
  }

  const key = data as ApiKeyRecord;

  if (SCOPE_RANK[key.scope] < SCOPE_RANK[required]) {
    return {
      response: apiError(
        request,
        403,
        "insufficient_scope",
        required === "write"
          ? "Esta API key es de solo lectura. Para escribir hace falta una key con scope 'write'."
          : "Esta API key no tiene permiso para este recurso."
      ),
    };
  }

  const limit = checkRateLimit(key);
  if (!limit.ok) {
    return {
      response: apiError(request, 429, "rate_limited", "Demasiadas requests, probá en un rato.", {
        "Retry-After": String(limit.retryAfter),
      }),
    };
  }

  // last_used_at, como mucho una vez cada 10 min por key (sin bloquear la respuesta)
  const now = Date.now();
  if (now - (lastTouched.get(key.id) ?? 0) > 10 * 60_000) {
    lastTouched.set(key.id, now);
    void supabase
      .from("api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", key.id)
      .then(() => undefined);
  }

  return { key };
}

// ---------------------------------------------------------------------------
// Helpers de datos
// ---------------------------------------------------------------------------

type InventoryRow = {
  id: string;
  name: string;
  sku: string;
  ean: string | null;
  stock: number;
  marca: string | null;
  unit_price: number | string | null;
  supplier: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export const PRODUCT_COLUMNS =
  "id, name, sku, ean, stock, marca, unit_price, supplier, created_at, updated_at";

// numeric de Postgres llega como string; la API siempre devuelve number
function toNumber(v: number | string | null): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/** Qué ve cada scope de un producto. unit_price = costo neto (sin IVA ni margen). */
export function productView(row: InventoryRow, scope: ApiScope) {
  const base = {
    name: row.name,
    sku: row.sku,
    ean: row.ean,
    marca: row.marca,
    stock: row.stock,
    unit_price: toNumber(row.unit_price),
  };
  if (scope === "public") return base;
  // private y write ven lo mismo
  return {
    id: row.id,
    ...base,
    supplier: row.supplier,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Saca caracteres que rompen los filtros .or()/ilike de PostgREST. */
export function sanitizeSearch(value: string): string {
  return value.replace(/[,()%*\\"':]/g, " ").replace(/\s+/g, " ").trim();
}

/** Variantes de un EAN con/sin ceros iniciales (por si quedó alguno viejo sin normalizar). */
export function eanVariants(value: string): string[] {
  const digits = value.trim();
  if (!/^\d+$/.test(digits)) return [digits];
  const stripped = digits.replace(/^0+/, "") || "0";
  return [...new Set([digits, stripped, `0${stripped}`, `00${stripped}`])];
}

export function parseIntParam(
  raw: string | null,
  fallback: number,
  min: number,
  max: number
): number {
  const n = raw == null ? NaN : parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

/** Trae TODAS las filas de una query paginando de a 1000 (límite de PostgREST). */
export async function fetchAllInventory(
  columns = PRODUCT_COLUMNS
): Promise<InventoryRow[]> {
  const supabase = createServiceClient();
  const rows: InventoryRow[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from("inventory")
      .select(columns)
      .order("id")
      .range(from, from + page - 1);
    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as unknown as InventoryRow[];
    rows.push(...chunk);
    if (chunk.length < page) break;
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Escritura
// ---------------------------------------------------------------------------

/** Lee el body JSON. Devuelve el objeto o una Response 400 lista para retornar. */
export async function readJsonBody(
  request: Request
): Promise<{ body: Record<string, unknown> } | { response: Response }> {
  try {
    const body = await request.json();
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("not an object");
    }
    return { body: body as Record<string, unknown> };
  } catch {
    return {
      response: apiError(request, 400, "invalid_json", "El body tiene que ser un objeto JSON."),
    };
  }
}

/** Busca productos por EAN o SKU (tolera ceros iniciales). */
export async function findByCode(code: string): Promise<InventoryRow[]> {
  const list = eanVariants(code)
    .map((v) => `"${v.replace(/"/g, "")}"`)
    .join(",");
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("inventory")
    .select(PRODUCT_COLUMNS)
    .or(`ean.in.(${list}),sku.in.(${list})`)
    .limit(5);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as InventoryRow[];
}

/** Registra una escritura hecha por la API (antes/después), para poder auditar o recuperar. */
export async function logAudit(entry: {
  key: { id: string; name: string };
  action: "create" | "update" | "stock" | "delete";
  productId: string | null;
  productEan: string | null;
  before: unknown;
  after: unknown;
}): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.from("api_audit_log").insert({
    api_key_id: entry.key.id,
    api_key_name: entry.key.name,
    action: entry.action,
    product_id: entry.productId,
    product_ean: entry.productEan,
    before: entry.before ?? null,
    after: entry.after ?? null,
  });
  // El audit nunca debe tumbar la operación, pero queremos enterarnos si falla.
  if (error) console.error("[api_audit_log]", error.message);
}

export type ValidationResult<T> = { value: T } | { error: string };

export function validateEan(raw: unknown): ValidationResult<string | null> {
  if (raw === null || raw === "") return { value: null };
  if (typeof raw !== "string" && typeof raw !== "number") {
    return { error: "'ean' tiene que ser texto con solo dígitos." };
  }
  const s = String(raw).trim();
  if (!/^\d{6,14}$/.test(s)) {
    return { error: "'ean' tiene que tener entre 6 y 14 dígitos, sin espacios ni guiones." };
  }
  return { value: s };
}

export function validateText(
  raw: unknown,
  field: string,
  max: number
): ValidationResult<string | null> {
  if (raw === null) return { value: null };
  if (typeof raw !== "string") return { error: `'${field}' tiene que ser texto.` };
  const s = raw.trim().replace(/\s+/g, " ");
  if (s.length > max) return { error: `'${field}' no puede superar ${max} caracteres.` };
  return { value: s || null };
}

export function validatePrice(raw: unknown): ValidationResult<number | null> {
  if (raw === null) return { value: null };
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0 || raw > 1e9) {
    return { error: "'unit_price' tiene que ser un número mayor o igual a 0 (costo neto, sin IVA)." };
  }
  return { value: Math.round(raw * 100) / 100 };
}

export function validateInt(
  raw: unknown,
  field: string,
  min: number
): ValidationResult<number> {
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < min || raw > 1e7) {
    return { error: `'${field}' tiene que ser un entero${min >= 0 ? " mayor o igual a " + min : ""}.` };
  }
  return { value: raw };
}

/** Marca/proveedor ya existentes (para reutilizar la misma escritura y no crear variantes). */
export async function existingValues(column: "marca" | "supplier"): Promise<string[]> {
  const rows = await fetchAllInventory(`id, ${column}`);
  const set = new Set<string>();
  for (const r of rows) {
    const v = (r as unknown as Record<string, string | null>)[column]?.trim();
    if (v) set.add(v);
  }
  return [...set];
}
