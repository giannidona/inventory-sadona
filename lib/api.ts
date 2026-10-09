import { createHash } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";

export type ApiScope = "public" | "private";

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
    "Access-Control-Allow-Methods": "GET, OPTIONS",
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
const RATE_LIMITS: Record<ApiScope, number> = { public: 120, private: 300 };
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

  // 'private' puede todo; 'public' solo lo público
  if (required === "private" && key.scope !== "private") {
    return {
      response: apiError(
        request,
        403,
        "insufficient_scope",
        "Esta API key no tiene permiso para este recurso."
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
