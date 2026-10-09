import type { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  apiError,
  apiJson,
  apiOptions,
  authenticate,
  eanVariants,
  parseIntParam,
} from "@/lib/api";

export const OPTIONS = apiOptions;

/**
 * GET /api/v1/movements   (solo key privada)
 * Historial de movimientos de stock (delta > 0 entra, < 0 sale).
 *   ean      filtra por EAN o SKU de un producto
 *   type     in | out
 *   since    fecha ISO
 *   limit 1-500 (default 100)   offset
 */
export async function GET(request: NextRequest) {
  const auth = await authenticate(request, "private");
  if ("response" in auth) return auth.response;

  const sp = request.nextUrl.searchParams;
  const limit = parseIntParam(sp.get("limit"), 100, 1, 500);
  const offset = parseIntParam(sp.get("offset"), 0, 0, 1_000_000);

  const supabase = createServiceClient();
  let query = supabase
    .from("stock_movements")
    .select("id, delta, reason, created_at, inventory_id, inventory(name, sku, ean, marca)", {
      count: "exact",
    });

  const code = sp.get("ean");
  if (code) {
    const list = eanVariants(code).map((v) => `"${v.replace(/"/g, "")}"`).join(",");
    const { data: products } = await supabase
      .from("inventory")
      .select("id")
      .or(`ean.in.(${list}),sku.in.(${list})`);
    const ids = (products ?? []).map((p) => p.id);
    if (ids.length === 0) {
      return apiJson(request, { data: [], meta: { total: 0, limit, offset } });
    }
    query = query.in("inventory_id", ids);
  }

  const type = sp.get("type");
  if (type === "in") query = query.gt("delta", 0);
  if (type === "out") query = query.lt("delta", 0);

  const since = sp.get("since");
  if (since) {
    const d = new Date(since);
    if (Number.isNaN(d.getTime())) {
      return apiError(request, 400, "bad_request", "'since' no es una fecha válida (usá YYYY-MM-DD).");
    }
    query = query.gte("created_at", d.toISOString());
  }

  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return apiError(request, 500, "db_error", error.message);

  type Row = {
    id: string;
    delta: number;
    reason: string | null;
    created_at: string;
    inventory: { name: string; sku: string; ean: string | null; marca: string | null } | null;
  };

  return apiJson(request, {
    data: ((data ?? []) as unknown as Row[]).map((m) => ({
      id: m.id,
      created_at: m.created_at,
      delta: m.delta,
      reason: m.reason,
      product: m.inventory
        ? { name: m.inventory.name, sku: m.inventory.sku, ean: m.inventory.ean, marca: m.inventory.marca }
        : null,
    })),
    meta: { total: count ?? 0, limit, offset },
  });
}
