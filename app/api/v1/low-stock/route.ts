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
} from "@/lib/api";

export const OPTIONS = apiOptions;

/**
 * GET /api/v1/low-stock   (solo key privada)
 *   threshold  stock <= threshold (default 5)
 *   include_zero  false -> excluye los que están en 0 (default true)
 *   limit 1-500 (default 100)   offset
 */
export async function GET(request: NextRequest) {
  const auth = await authenticate(request, "private");
  if ("response" in auth) return auth.response;

  const sp = request.nextUrl.searchParams;
  const threshold = parseIntParam(sp.get("threshold"), 5, 0, 1_000_000);
  const limit = parseIntParam(sp.get("limit"), 100, 1, 500);
  const offset = parseIntParam(sp.get("offset"), 0, 0, 1_000_000);

  const supabase = createServiceClient();
  let query = supabase
    .from("inventory")
    .select(PRODUCT_COLUMNS, { count: "exact" })
    .lte("stock", threshold);
  if (sp.get("include_zero") === "false") query = query.gt("stock", 0);

  const { data, count, error } = await query
    .order("stock", { ascending: true })
    .order("name")
    .range(offset, offset + limit - 1);

  if (error) return apiError(request, 500, "db_error", error.message);

  return apiJson(request, {
    data: (data ?? []).map((row) => productView(row as never, auth.key.scope)),
    meta: { total: count ?? 0, limit, offset, threshold },
  });
}
