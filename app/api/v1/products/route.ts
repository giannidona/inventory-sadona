import type { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  PRODUCT_COLUMNS,
  apiError,
  apiJson,
  apiOptions,
  authenticate,
  parseIntParam,
  productView,
  sanitizeSearch,
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
