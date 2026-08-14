"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getStockArrivals } from "@/app/actions/stock-arrivals";
import { doanSearchUrl, mercadoLibreSearchUrl } from "@/lib/marketplace-links";
import { ExternalLinkIcon, ShoppingBagIcon } from "@/components/icons";
import { loadDismissedIds, saveDismissedIds } from "@/lib/dismissed-ids";
import type { StockArrival } from "@/lib/types";
import { toast } from "sonner";

const DISMISSED_KEY = "sadona:dismissedStockArrivals";

export default function StockArrivalsPage() {
  const [arrivals, setArrivals] = useState<StockArrival[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState<Set<string>>(() =>
    loadDismissedIds(DISMISSED_KEY)
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const result = await getStockArrivals();
      if (cancelled) return;

      if (!result.success) {
        toast.error(result.error);
        setLoading(false);
        return;
      }

      setArrivals(result.data as StockArrival[]);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleArrivals = useMemo(
    () => arrivals.filter((a) => !dismissed.has(a.id)),
    [arrivals, dismissed]
  );

  function dismissOne(id: string) {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveDismissedIds(DISMISSED_KEY, next);
      return next;
    });
  }

  function dismissAll() {
    if (visibleArrivals.length === 0) return;
    setDismissed((prev) => {
      const next = new Set(prev);
      for (const arrival of visibleArrivals) next.add(arrival.id);
      saveDismissedIds(DISMISSED_KEY, next);
      return next;
    });
    toast.success("Lista de ingresos borrada");
  }

  return (
    <div className="page-container px-4 py-6">
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold text-white">
            Ingresos de stock
          </h1>
          {!loading && visibleArrivals.length > 0 && (
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-[#E0457B]/20 px-1.5 text-xs font-bold tabular-nums text-[#E0457B]">
              {visibleArrivals.length}
            </span>
          )}
          {!loading && visibleArrivals.length > 0 && (
            <button
              type="button"
              onClick={dismissAll}
              className="text-xs font-medium text-white/50 transition-colors hover:text-white"
            >
              Limpiar todo
            </button>
          )}
        </div>
        <p className="mt-1 text-sm text-white/50">
          Todo lo que entró por factura, para actualizar el stock en otras
          plataformas sin tener que volver a abrir la factura. Marcá cada uno
          como listo (✕) una vez que lo actualizaste afuera.
        </p>
      </div>

      {loading ? (
        <div className="glass-card p-12 text-center text-white/50">
          Cargando ingresos de stock...
        </div>
      ) : visibleArrivals.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <p className="text-white/50">
            {arrivals.length > 0
              ? "Limpiaste todos los ingresos de stock"
              : "Todavía no se procesó ninguna factura"}
          </p>
          <p className="mt-1 text-xs text-white/30">
            {arrivals.length > 0
              ? "Los que entren de acá en más van a aparecer arriba."
              : "Subí una factura y cada producto que entre va a aparecer acá."}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="glass-card hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-white/50">
                    <th className="px-4 py-3 font-medium">Producto</th>
                    <th className="px-4 py-3 font-medium">SKU</th>
                    <th className="px-4 py-3 font-medium">EAN</th>
                    <th className="px-4 py-3 font-medium">Ingresó</th>
                    <th className="px-4 py-3 font-medium">Stock actual</th>
                    <th className="px-4 py-3 font-medium">Factura</th>
                    <th className="px-4 py-3 font-medium">Fecha</th>
                    <th className="px-4 py-3 font-medium">Doan</th>
                    <th className="px-4 py-3 font-medium">ML</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleArrivals.map((arrival) => (
                    <tr
                      key={arrival.id}
                      className="border-b border-white/5 transition-colors hover:bg-white/[0.02]"
                    >
                      <td className="px-4 py-3 font-medium text-white">
                        <div className="flex items-center gap-2">
                          <span>{arrival.product_name}</span>
                          <button
                            type="button"
                            onClick={() => dismissOne(arrival.id)}
                            title="Quitar de la lista"
                            aria-label="Quitar de la lista"
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-white/30 transition-colors hover:bg-white/10 hover:text-white"
                          >
                            ✕
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-white/50">
                        {arrival.sku ?? "—"}
                      </td>
                      <td className="px-4 py-3 font-mono text-white/50">
                        {arrival.ean ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-lg bg-green-500/10 px-2 py-1 text-xs font-semibold tabular-nums text-green-400">
                          +{arrival.quantity_added}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold tabular-nums text-white">
                        {arrival.new_stock}
                      </td>
                      <td className="px-4 py-3">
                        {arrival.invoice_id ? (
                          <Link
                            href={`/invoices/${arrival.invoice_id}`}
                            className="text-xs font-medium text-[#E0457B] hover:underline"
                          >
                            {arrival.invoices?.invoice_number ?? "Ver factura"}
                          </Link>
                        ) : (
                          <span className="text-white/30">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-white/50">
                        {new Date(arrival.created_at).toLocaleDateString("es-AR")}
                      </td>
                      <td className="px-4 py-3">
                        {arrival.ean || arrival.sku ? (
                          <a
                            href={doanSearchUrl(arrival.ean ?? arrival.sku ?? "")}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Ver en Doan"
                            aria-label="Ver en Doan"
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#E0457B]/30 text-[#E0457B]/90 transition-colors hover:bg-[#E0457B]/10"
                          >
                            <ExternalLinkIcon />
                          </a>
                        ) : (
                          <span className="text-white/30">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {arrival.sku ? (
                          <a
                            href={mercadoLibreSearchUrl(arrival.sku)}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Ver en MercadoLibre"
                            aria-label="Ver en MercadoLibre"
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-yellow-400/30 text-yellow-400/90 transition-colors hover:bg-yellow-400/10"
                          >
                            <ShoppingBagIcon />
                          </a>
                        ) : (
                          <span className="text-white/30">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {visibleArrivals.map((arrival) => (
              <div key={arrival.id} className="glass-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-semibold text-white">
                        {arrival.product_name}
                      </h3>
                      <button
                        type="button"
                        onClick={() => dismissOne(arrival.id)}
                        title="Quitar de la lista"
                        aria-label="Quitar de la lista"
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white/30 transition-colors hover:bg-white/10 hover:text-white"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2">
                      <p className="font-mono text-xs text-white/50">
                        {arrival.sku ?? "—"}
                        {arrival.ean && ` · ${arrival.ean}`}
                      </p>
                      {(arrival.ean || arrival.sku) && (
                        <div className="flex items-center gap-1.5">
                          <a
                            href={doanSearchUrl(arrival.ean ?? arrival.sku ?? "")}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Ver en Doan"
                            aria-label="Ver en Doan"
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[#E0457B]/30 text-[#E0457B]/90"
                          >
                            <ExternalLinkIcon />
                          </a>
                          <a
                            href={mercadoLibreSearchUrl(arrival.sku ?? arrival.ean ?? "")}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Ver en MercadoLibre"
                            aria-label="Ver en MercadoLibre"
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-yellow-400/30 text-yellow-400/90"
                          >
                            <ShoppingBagIcon />
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                  <span className="inline-flex shrink-0 items-center rounded-lg bg-green-500/10 px-2 py-1 text-xs font-semibold tabular-nums text-green-400">
                    +{arrival.quantity_added}
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-2 text-sm">
                  <span className="text-white/40">Stock actual:</span>
                  <span className="font-semibold tabular-nums text-white">
                    {arrival.new_stock}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-white/40">
                  {arrival.invoice_id ? (
                    <Link
                      href={`/invoices/${arrival.invoice_id}`}
                      className="font-medium text-[#E0457B]"
                    >
                      {arrival.invoices?.invoice_number ?? "Ver factura"}
                    </Link>
                  ) : (
                    <span>—</span>
                  )}
                  <span>
                    {new Date(arrival.created_at).toLocaleDateString("es-AR")}
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
