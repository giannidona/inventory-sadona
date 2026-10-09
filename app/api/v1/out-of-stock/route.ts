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
 * GET /api/v1/out-of-stock   (stock = 0)
 *   Ordenados por el último movimiento: los que se acaban de quedar sin stock primero.
 *   limit 1-500 (default 100)   offset
 */
export async function GET(request: NextRequest) {
  const auth = await authenticate(request, "public");
  if ("response" in auth) return auth.response;

  const sp = request.nextUrl.searchParams;
  const limit = parseIntParam(sp.get("limit"), 100, 1, 500);
  const offset = parseIntParam(sp.get("offset"), 0, 0, 1_000_000);

  const supabase = createServiceClient();
  const { data, count, error } = await supabase
    .from("inventory")
    .select(PRODUCT_COLUMNS, { count: "exact" })
    .eq("stock", 0)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("id")
    .range(offset, offset + limit - 1);

  if (error) return apiError(request, 500, "db_error", error.message);

  return apiJson(request, {
    data: (data ?? []).map((row) => productView(row as never, auth.key.scope)),
    meta: { total: count ?? 0, limit, offset },
  });
}
