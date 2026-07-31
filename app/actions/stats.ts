"use server";

import { createServiceClient } from "@/lib/supabase/server";

export type ProductStat = {
  inventory_id: string;
  name: string;
  sku: string;
  ean: string | null;
  marca: string | null;
  unit_price: number | null;
  current_stock: number;
  total_removed: number;
  movement_count: number;
  last_movement_at: string | null;
};

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; data: T };

/**
 * Ranks products by how much stock we've removed over time (sales, uso,
 * ajustes), using the existing stock_movements history — no separate
 * "sales" table needed, so old movements are included automatically.
 */
export async function getTopMovedProducts(
  limit = 100
): Promise<ActionResult<ProductStat[]>> {
  const supabase = createServiceClient();

  const { data: movements, error: movementsError } = await supabase
    .from("stock_movements")
    .select("inventory_id, delta, created_at")
    .lt("delta", 0);

  if (movementsError) {
    return { success: false, error: movementsError.message, data: [] };
  }

  const { data: inventory, error: inventoryError } = await supabase
    .from("inventory")
    .select("id, name, sku, ean, marca, unit_price, stock");

  if (inventoryError) {
    return { success: false, error: inventoryError.message, data: [] };
  }

  const inventoryMap = new Map((inventory ?? []).map((item) => [item.id, item]));

  type Agg = {
    total_removed: number;
    movement_count: number;
    last_movement_at: string | null;
  };
  const totals = new Map<string, Agg>();

  for (const m of movements ?? []) {
    if (!m.inventory_id) continue;
    const existing: Agg = totals.get(m.inventory_id) ?? {
      total_removed: 0,
      movement_count: 0,
      last_movement_at: null,
    };
    existing.total_removed += Math.abs(m.delta);
    existing.movement_count += 1;
    if (!existing.last_movement_at || m.created_at > existing.last_movement_at) {
      existing.last_movement_at = m.created_at;
    }
    totals.set(m.inventory_id, existing);
  }

  const stats: ProductStat[] = [];
  for (const [inventoryId, agg] of totals.entries()) {
    const product = inventoryMap.get(inventoryId);
    if (!product) continue; // product deleted since (cascade removes its movements too)

    stats.push({
      inventory_id: inventoryId,
      name: product.name,
      sku: product.sku,
      ean: product.ean,
      marca: product.marca,
      unit_price: product.unit_price,
      current_stock: product.stock,
      total_removed: agg.total_removed,
      movement_count: agg.movement_count,
      last_movement_at: agg.last_movement_at,
    });
  }

  stats.sort((a, b) => b.total_removed - a.total_removed);

  return { success: true, data: stats.slice(0, limit) };
}
