"use server";

import { createServiceClient } from "@/lib/supabase/server";

export async function getStockArrivals() {
  const supabase = createServiceClient();

  const [arrivalsRes, priceChangesRes] = await Promise.all([
    supabase
      .from("stock_arrivals")
      .select("*, invoices(invoice_number)")
      .order("created_at", { ascending: false }),
    supabase.from("price_changes").select("invoice_id, inventory_id, old_price"),
  ]);

  if (arrivalsRes.error) {
    return { success: false as const, error: arrivalsRes.error.message, data: [] };
  }

  // stock_arrivals and price_changes are both written from the same invoice
  // line inside processInvoice(), sharing invoice_id + inventory_id — join
  // them here so a price change shows up inline on its arrival row instead
  // of living on a separate tab.
  const oldPriceByKey = new Map<string, number>();
  for (const pc of priceChangesRes.data ?? []) {
    if (!pc.invoice_id || !pc.inventory_id) continue;
    oldPriceByKey.set(`${pc.invoice_id}:${pc.inventory_id}`, pc.old_price);
  }

  const data = (arrivalsRes.data ?? []).map((arrival) => ({
    ...arrival,
    old_price:
      arrival.invoice_id && arrival.inventory_id
        ? (oldPriceByKey.get(`${arrival.invoice_id}:${arrival.inventory_id}`) ?? null)
        : null,
  }));

  return { success: true as const, data };
}
