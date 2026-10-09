import type { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  apiError,
  apiJson,
  apiOptions,
  authenticate,
  parseIntParam,
} from "@/lib/api";

export const OPTIONS = apiOptions;

/**
 * GET /api/v1/arrivals   (solo key privada)
 * Todo lo que entró por factura, con el precio anterior si cambió.
 *   since    fecha ISO (ej. 2026-10-01) -> solo ingresos desde ahí
 *   is_new   true -> solo productos que se crearon con esa factura
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
    .from("stock_arrivals")
    .select("*, invoices(invoice_number, supplier)", { count: "exact" });

  const since = sp.get("since");
  if (since) {
    const d = new Date(since);
    if (Number.isNaN(d.getTime())) {
      return apiError(request, 400, "bad_request", "'since' no es una fecha válida (usá YYYY-MM-DD).");
    }
    query = query.gte("created_at", d.toISOString());
  }
  if (sp.get("is_new") === "true") query = query.eq("is_new", true);

  const [arrivalsRes, priceChangesRes] = await Promise.all([
    query.order("created_at", { ascending: false }).range(offset, offset + limit - 1),
    supabase.from("price_changes").select("invoice_id, inventory_id, old_price"),
  ]);

  if (arrivalsRes.error) return apiError(request, 500, "db_error", arrivalsRes.error.message);

  const oldPrice = new Map<string, number>();
  for (const pc of priceChangesRes.data ?? []) {
    if (pc.invoice_id && pc.inventory_id) {
      oldPrice.set(`${pc.invoice_id}:${pc.inventory_id}`, Number(pc.old_price));
    }
  }

  const data = (arrivalsRes.data ?? []).map((a) => ({
    id: a.id,
    created_at: a.created_at,
    product_name: a.product_name,
    sku: a.sku,
    ean: a.ean,
    quantity_added: a.quantity_added,
    new_stock: a.new_stock,
    unit_price: a.unit_price != null ? Number(a.unit_price) : null,
    old_price:
      a.invoice_id && a.inventory_id
        ? (oldPrice.get(`${a.invoice_id}:${a.inventory_id}`) ?? null)
        : null,
    is_new: a.is_new,
    invoice_number: a.invoices?.invoice_number ?? null,
    supplier: a.invoices?.supplier ?? null,
  }));

  return apiJson(request, {
    data,
    meta: { total: arrivalsRes.count ?? 0, limit, offset },
  });
}
