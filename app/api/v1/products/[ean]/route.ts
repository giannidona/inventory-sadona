import type { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  PRODUCT_COLUMNS,
  apiError,
  apiJson,
  apiOptions,
  authenticate,
  eanVariants,
  productView,
} from "@/lib/api";

export const OPTIONS = apiOptions;

/**
 * GET /api/v1/products/{ean}
 * Busca por EAN o SKU. Tolera ceros iniciales (041554... = 41554...).
 */
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ ean: string }> }
) {
  const auth = await authenticate(request, "public");
  if ("response" in auth) return auth.response;

  const { ean } = await ctx.params;
  const variants = eanVariants(decodeURIComponent(ean));
  const list = variants.map((v) => `"${v.replace(/"/g, "")}"`).join(",");

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("inventory")
    .select(PRODUCT_COLUMNS)
    .or(`ean.in.(${list}),sku.in.(${list})`)
    .limit(5);

  if (error) return apiError(request, 500, "db_error", error.message);
  if (!data || data.length === 0) {
    return apiError(request, 404, "not_found", `No hay ningún producto con EAN/SKU ${ean}.`);
  }

  return apiJson(request, { data: productView(data[0] as never, auth.key.scope) });
}
