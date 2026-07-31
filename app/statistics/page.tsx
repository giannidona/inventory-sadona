"use client";

import { useEffect, useMemo, useState } from "react";
import { getTopMovedProducts } from "@/app/actions/stats";
import { formatPrice } from "@/lib/invoice-utils";
import { doanProductUrl, mercadoLibreSearchUrl } from "@/lib/marketplace-links";
import { ExternalLinkIcon, ShoppingBagIcon, TrendingUpIcon } from "@/components/icons";
import type { ProductStat } from "@/app/actions/stats";
import { toast } from "sonner";

const MEDALS = ["🥇", "🥈", "🥉"];

export default function StatisticsPage() {
  const [stats, setStats] = useState<ProductStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const result = await getTopMovedProducts();
      if (cancelled) return;

      if (!result.success) {
        toast.error(result.error);
        setLoading(false);
        return;
      }

      setStats(result.data);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const maxRemoved = useMemo(
    () => stats.reduce((max, s) => Math.max(max, s.total_removed), 0),
    [stats]
  );

  const top3 = stats.slice(0, 3);
  const rest = stats.slice(3);

  return (
    <div className="page-container px-4 py-6">
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <TrendingUpIcon />
          <h1 className="text-2xl font-semibold text-white">Estadísticas</h1>
        </div>
        <p className="mt-1 text-sm text-white/50">
          Ranking de productos según las unidades que más descontamos del
          stock (ventas, uso, ajustes). Usa todo el historial de movimientos
          guardado, incluidos los más viejos.
        </p>
      </div>

      {loading ? (
        <div className="glass-card p-12 text-center text-white/50">
          Cargando estadísticas...
        </div>
      ) : stats.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <p className="text-white/50">Todavía no hay movimientos de stock</p>
          <p className="mt-1 text-xs text-white/30">
            En cuanto descuentes stock (venta, ajuste o escaneo), los
            productos van a empezar a aparecer acá.
          </p>
        </div>
      ) : (
        <>
          {/* Top 3 highlight */}
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            {top3.map((item, idx) => (
              <div
                key={item.inventory_id}
                className="glass-card relative overflow-hidden p-5"
              >
                <div
                  className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#E0457B]/10 to-transparent"
                  style={{ opacity: 1 - idx * 0.3 }}
                />
                <div className="relative">
                  <div className="flex items-center justify-between">
                    <span className="text-2xl">{MEDALS[idx]}</span>
                    <span className="text-xs font-semibold text-white/40">
                      #{idx + 1}
                    </span>
                  </div>
                  <h3 className="mt-2 truncate font-semibold text-white">
                    {item.name}
                  </h3>
                  <p className="font-mono text-xs text-white/40">
                    {item.sku}
                    {item.marca && ` · ${item.marca}`}
                  </p>
                  <p className="mt-3 text-2xl font-bold tabular-nums text-[#E0457B]">
                    {item.total_removed}
                    <span className="ml-1 text-xs font-medium text-white/40">
                      unidades
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-white/40">
                    {item.movement_count} movimiento
                    {item.movement_count !== 1 ? "s" : ""}
                    {item.unit_price != null &&
                      ` · ${formatPrice(item.unit_price * item.total_removed)} est.`}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="glass-card hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-white/50">
                    <th className="px-4 py-3 font-medium">#</th>
                    <th className="px-4 py-3 font-medium">Producto</th>
                    <th className="px-4 py-3 font-medium">SKU</th>
                    <th className="px-4 py-3 font-medium">Unidades</th>
                    <th className="px-4 py-3 font-medium">Movimientos</th>
                    <th className="px-4 py-3 font-medium">Último movimiento</th>
                    <th className="px-4 py-3 font-medium">Stock actual</th>
                    <th className="px-4 py-3 font-medium">Doan</th>
                    <th className="px-4 py-3 font-medium">ML</th>
                  </tr>
                </thead>
                <tbody>
                  {rest.map((item, idx) => (
                    <tr
                      key={item.inventory_id}
                      className="border-b border-white/5 transition-colors hover:bg-white/[0.02]"
                    >
                      <td className="px-4 py-3 text-white/40">{idx + 4}</td>
                      <td className="px-4 py-3 font-medium text-white">
                        {item.name}
                      </td>
                      <td className="px-4 py-3 font-mono text-white/50">
                        {item.sku}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="w-10 shrink-0 font-semibold tabular-nums text-white">
                            {item.total_removed}
                          </span>
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/5">
                            <div
                              className="h-full rounded-full bg-[#E0457B]"
                              style={{
                                width: `${maxRemoved > 0 ? (item.total_removed / maxRemoved) * 100 : 0}%`,
                              }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-white/50">
                        {item.movement_count}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-white/50">
                        {item.last_movement_at
                          ? new Date(item.last_movement_at).toLocaleDateString(
                              "es-AR"
                            )
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-white/50">
                        {item.current_stock}
                      </td>
                      <td className="px-4 py-3">
                        <a
                          href={doanProductUrl(item.sku)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Ver en Doan"
                          aria-label="Ver en Doan"
                          className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#E0457B]/30 text-[#E0457B]/90 transition-colors hover:bg-[#E0457B]/10"
                        >
                          <ExternalLinkIcon />
                        </a>
                      </td>
                      <td className="px-4 py-3">
                        <a
                          href={mercadoLibreSearchUrl(item.sku)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Ver en MercadoLibre"
                          aria-label="Ver en MercadoLibre"
                          className="flex h-9 w-9 items-center justify-center rounded-lg border border-yellow-400/30 text-yellow-400/90 transition-colors hover:bg-yellow-400/10"
                        >
                          <ShoppingBagIcon />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {rest.map((item, idx) => (
              <div key={item.inventory_id} className="glass-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-white/30">
                        #{idx + 4}
                      </span>
                      <h3 className="truncate font-semibold text-white">
                        {item.name}
                      </h3>
                    </div>
                    <p className="mt-0.5 font-mono text-xs text-white/50">
                      {item.sku}
                      {item.marca && ` · ${item.marca}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <a
                      href={doanProductUrl(item.sku)}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Ver en Doan"
                      aria-label="Ver en Doan"
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#E0457B]/30 text-[#E0457B]/90"
                    >
                      <ExternalLinkIcon />
                    </a>
                    <a
                      href={mercadoLibreSearchUrl(item.sku)}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Ver en MercadoLibre"
                      aria-label="Ver en MercadoLibre"
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-yellow-400/30 text-yellow-400/90"
                    >
                      <ShoppingBagIcon />
                    </a>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <span className="w-10 shrink-0 font-semibold tabular-nums text-white">
                    {item.total_removed}
                  </span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full bg-[#E0457B]"
                      style={{
                        width: `${maxRemoved > 0 ? (item.total_removed / maxRemoved) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-white/40">
                  <span>
                    {item.movement_count} mov. · stock {item.current_stock}
                  </span>
                  <span>
                    {item.last_movement_at
                      ? new Date(item.last_movement_at).toLocaleDateString(
                          "es-AR"
                        )
                      : "—"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
