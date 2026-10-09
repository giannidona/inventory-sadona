import type { NextRequest } from "next/server";
import { apiError, apiJson, apiOptions, authenticate, fetchAllInventory } from "@/lib/api";

export const OPTIONS = apiOptions;

/**
 * GET /api/v1/brands
 * Marcas con cantidad de productos y unidades en stock.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticate(request, "public");
  if ("response" in auth) return auth.response;

  try {
    const rows = await fetchAllInventory("id, marca, stock");
    const byBrand = new Map<string, { products: number; units: number }>();
    for (const r of rows) {
      const marca = r.marca?.trim();
      if (!marca) continue;
      const entry = byBrand.get(marca) ?? { products: 0, units: 0 };
      entry.products += 1;
      entry.units += Math.max(r.stock, 0);
      byBrand.set(marca, entry);
    }
    const data = [...byBrand.entries()]
      .map(([marca, v]) => ({ marca, ...v }))
      .sort((a, b) => a.marca.localeCompare(b.marca, "es"));
    return apiJson(request, { data, meta: { total: data.length } });
  } catch (e) {
    return apiError(request, 500, "db_error", e instanceof Error ? e.message : "Error");
  }
}
