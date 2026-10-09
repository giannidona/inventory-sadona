import type { NextRequest } from "next/server";
import { getTopMovedProducts } from "@/app/actions/stats";
import {
  apiError,
  apiJson,
  apiOptions,
  authenticate,
  fetchAllInventory,
  parseIntParam,
} from "@/lib/api";

export const OPTIONS = apiOptions;

/**
 * GET /api/v1/stats   (solo key privada)
 * Resumen del inventario + los más vendidos/movidos.
 *   low_stock_threshold  default 5
 *   top                  cuántos productos "más movidos" devolver (0-50, default 10)
 * Valor de inventario = sum(unit_price * stock) a costo neto (sin IVA).
 */
export async function GET(request: NextRequest) {
  const auth = await authenticate(request, "private");
  if ("response" in auth) return auth.response;

  const sp = request.nextUrl.searchParams;
  const threshold = parseIntParam(sp.get("low_stock_threshold"), 5, 0, 1_000_000);
  const top = parseIntParam(sp.get("top"), 10, 0, 50);

  try {
    const rows = await fetchAllInventory("id, name, sku, ean, stock, marca, unit_price, supplier, created_at, updated_at");

    let units = 0;
    let value = 0;
    let outOfStock = 0;
    let lowStock = 0;
    let withoutPrice = 0;
    const brands = new Set<string>();

    for (const r of rows) {
      const stock = Math.max(r.stock, 0);
      const price = r.unit_price == null ? null : Number(r.unit_price);
      units += stock;
      if (price != null) value += price * stock;
      else withoutPrice += 1;
      if (r.stock === 0) outOfStock += 1;
      else if (r.stock <= threshold) lowStock += 1;
      if (r.marca?.trim()) brands.add(r.marca.trim());
    }

    const topMoved = top > 0 ? (await getTopMovedProducts(top)).data : [];

    return apiJson(request, {
      data: {
        products: rows.length,
        brands: brands.size,
        units_in_stock: units,
        out_of_stock: outOfStock,
        low_stock: lowStock,
        low_stock_threshold: threshold,
        products_without_price: withoutPrice,
        inventory_value_net: Math.round(value * 100) / 100,
        top_moved: topMoved.slice(0, top).map((p) => ({
          name: p.name,
          sku: p.sku,
          ean: p.ean,
          marca: p.marca,
          current_stock: p.current_stock,
          total_removed: p.total_removed,
          last_movement_at: p.last_movement_at,
        })),
      },
    });
  } catch (e) {
    return apiError(request, 500, "db_error", e instanceof Error ? e.message : "Error");
  }
}
