"use server";

import { createServiceClient } from "@/lib/supabase/server";

/** Same underlying log as stock_arrivals, filtered to just the rows where
 *  a brand-new product was created (not an existing one restocked). */
export async function getNewProducts() {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("stock_arrivals")
    .select("*, invoices(invoice_number)")
    .eq("is_new", true)
    .order("created_at", { ascending: false });

  if (error) {
    return { success: false as const, error: error.message, data: [] };
  }

  return { success: true as const, data: data ?? [] };
}
