import { createBrowserClient } from "@/lib/supabase/client";
import type { InventoryItem } from "@/lib/types";

/**
 * Trae TODO el inventario paginando. Supabase corta cada consulta en 1000 filas,
 * así que sin paginar los productos de más desaparecen de la lista.
 */
export async function fetchAllInventory(): Promise<{
  data: InventoryItem[] | null;
  error: string | null;
}> {
  const supabase = createBrowserClient();
  const pageSize = 1000;
  const all: InventoryItem[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("inventory")
      .select("*")
      .order("name")
      .order("id") // desempate estable para que la paginación no repita ni saltee filas
      .range(from, from + pageSize - 1);
    if (error) return { data: null, error: error.message };
    all.push(...((data ?? []) as InventoryItem[]));
    if (!data || data.length < pageSize) break;
  }
  return { data: all, error: null };
}
