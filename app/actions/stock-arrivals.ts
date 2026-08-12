"use server";

import { createServiceClient } from "@/lib/supabase/server";

export async function getStockArrivals() {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("stock_arrivals")
    .select("*, invoices(invoice_number)")
    .order("created_at", { ascending: false });

  if (error) {
    return { success: false as const, error: error.message, data: [] };
  }

  return { success: true as const, data: data ?? [] };
}
