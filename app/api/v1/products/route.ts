import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { canonicalValue } from "@/lib/normalize";
import {
  PRODUCT_COLUMNS,
  apiError,
  apiJson,
  apiOptions,
  authenticate,
  existingValues,
  findByCode,
  logAudit,
  parseIntParam,
  productView,
  readJsonBody,
  sanitizeSearch,
  validateEan,
  validateInt,
  validatePrice,
  validateText,
} from "@/lib/api";

export const OPTIONS = apiOptions;

const SORTABLE = new Set(["name", "stock", "marca", "unit_price", "updated_at", "created_at"]);

/**
 * GET /api/v1/products
 *   q          texto: busca en nombre, marca, EAN y SKU (cada palabra tiene que aparecer)
 *   marca      marca exacta (sin importar mayúsculas)
 *   in_stock   true -> solo con stock > 0 | false -> solo sin stock
 *   supplier   (solo key privada) proveedor
 *   sort       name | stock | marca | unit_price | updated_at | created_at (default name)
 *   order      asc | desc (default asc)
 *   limit      1-200 (default 50)   offset  (default 0)
 */
export async function GET(request: NextRequest) {
  const auth = await authenticate(request, "public");
  if ("response" in auth) return auth.response;
  const { scope } = auth.key;

  const sp = request.nextUrl.searchParams;
  const limit = parseIntParam(sp.get("limit"), 50, 1, 200);
  const offset = parseIntParam(sp.get("offset"), 0, 0, 1_000_000);
  const sort = SORTABLE.has(sp.get("sort") ?? "") ? (sp.get("sort") as string) : "name";
  const ascending = sp.get("order") !== "desc";

  const supabase = createServiceClient();
  let query = supabase
    .from("inventory")
    .select(PRODUCT_COLUMNS, { count: "exact" });

  const q = sanitizeSearch(sp.get("q") ?? "");
  for (const token of q.split(" ").filter(Boolean)) {
    query = query.or(
      `name.ilike.%${token}%,marca.ilike.%${token}%,ean.ilike.%${token}%,sku.ilike.%${token}%`
    );
  }

  const marca = sanitizeSearch(sp.get("marca") ?? "");
  if (marca) query = query.ilike("marca", marca);

  const inStock = sp.get("in_stock");
  if (inStock === "true") query = query.gt("stock", 0);
  if (inStock === "false") query = query.lte("stock", 0);

  const supplier = sanitizeSearch(sp.get("supplier") ?? "");
  if (supplier && scope === "private") query = query.ilike("supplier", supplier);

  const { data, count, error } = await query
    .order(sort, { ascending, nullsFirst: false })
    .order("id")
    .range(offset, offset + limit - 1);

  if (error) return apiError(request, 500, "db_error", error.message);

  return apiJson(request, {
    data: (data ?? []).map((row) => productView(row as never, scope)),
    meta: { total: count ?? 0, limit, offset },
  });
}

const CREATE_FIELDS = new Set(["name", "ean", "sku", "marca", "supplier", "unit_price", "stock"]);

/**
 * POST /api/v1/products   (key con scope 'write')
 * Body JSON:
 *   name        (obligatorio)
 *   ean         dígitos (6-14). Si viene, el SKU queda igual al EAN.
 *   sku         obligatorio SOLO si no hay ean
 *   marca       se reutiliza la escritura que ya existe (L'Oreal/Loreal -> LOREAL); si es nueva, va en MAYÚSCULAS
 *   supplier    idem (reutiliza la escritura existente)
 *   unit_price  costo neto (sin IVA), número >= 0
 *   stock       stock inicial, entero >= 0 (default 0)
 * 201 con el producto creado | 409 si ya existe un producto con ese EAN/SKU.
 */
export async function POST(request: NextRequest) {
  const auth = await authenticate(request, "write");
  if ("response" in auth) return auth.response;

  const parsed = await readJsonBody(request);
  if ("response" in parsed) return parsed.response;
  const body = parsed.body;

  const unknown = Object.keys(body).filter((k) => !CREATE_FIELDS.has(k));
  if (unknown.length > 0) {
    return apiError(
      request,
      400,
      "unknown_field",
      `Campos no permitidos: ${unknown.join(", ")}. Permitidos: ${[...CREATE_FIELDS].join(", ")}.`
    );
  }

  const name = validateText(body.name, "name", 200);
  if ("error" in name) return apiError(request, 400, "invalid_field", name.error);
  if (!name.value) return apiError(request, 400, "invalid_field", "'name' es obligatorio.");

  const ean = validateEan(body.ean);
  if ("error" in ean) return apiError(request, 400, "invalid_field", ean.error);

  const skuIn = validateText(body.sku, "sku", 60);
  if ("error" in skuIn) return apiError(request, 400, "invalid_field", skuIn.error);

  // Regla del sistema: con EAN conocido, SKU = EAN.
  const sku = ean.value ?? skuIn.value;
  if (!sku) {
    return apiError(request, 400, "invalid_field", "Hace falta 'ean' o 'sku'.");
  }

  const marcaIn = validateText(body.marca, "marca", 80);
  if ("error" in marcaIn) return apiError(request, 400, "invalid_field", marcaIn.error);
  const supplierIn = validateText(body.supplier, "supplier", 80);
  if ("error" in supplierIn) return apiError(request, 400, "invalid_field", supplierIn.error);

  const price = body.unit_price === undefined ? { value: null } : validatePrice(body.unit_price);
  if ("error" in price) return apiError(request, 400, "invalid_field", price.error);

  const stock = body.stock === undefined ? { value: 0 } : validateInt(body.stock, "stock", 0);
  if ("error" in stock) return apiError(request, 400, "invalid_field", stock.error);

  try {
    // Duplicados: mismo EAN (con/sin ceros iniciales) o mismo SKU
    const dupes = await findByCode(sku);
    if (dupes.length > 0) {
      return apiJson(
        request,
        {
          error: {
            code: "duplicate",
            message: `Ya existe un producto con ese ${ean.value ? "EAN" : "SKU"}. Usá PATCH para editarlo o POST /products/{ean}/stock para ajustar el stock.`,
          },
          existing: productView(dupes[0], auth.key.scope),
        },
        { status: 409 }
      );
    }

    const marca = marcaIn.value
      ? canonicalValue(marcaIn.value, await existingValues("marca"), true)
      : null;
    const supplier = supplierIn.value
      ? canonicalValue(supplierIn.value, await existingValues("supplier"), false)
      : null;

    const supabase = createServiceClient();
    const { data: created, error } = await supabase
      .from("inventory")
      .insert({
        name: name.value,
        sku,
        ean: ean.value,
        marca,
        supplier,
        unit_price: price.value,
        stock: stock.value,
      })
      .select(PRODUCT_COLUMNS)
      .single();

    if (error || !created) {
      if (error?.code === "23505") {
        return apiError(request, 409, "duplicate", "Ya existe un producto con ese SKU/EAN.");
      }
      return apiError(request, 500, "db_error", error?.message ?? "No se pudo crear el producto.");
    }

    if (stock.value > 0) {
      await supabase.from("stock_movements").insert({
        inventory_id: created.id,
        delta: stock.value,
        reason: `alta por API (${auth.key.name})`,
      });
    }

    await logAudit({
      key: auth.key,
      action: "create",
      productId: created.id,
      productEan: created.ean,
      before: null,
      after: created,
    });

    revalidatePath("/");
    return apiJson(request, { data: productView(created as never, auth.key.scope) }, { status: 201 });
  } catch (e) {
    return apiError(request, 500, "db_error", e instanceof Error ? e.message : "Error");
  }
}
