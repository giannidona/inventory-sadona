"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getPriceChanges } from "@/app/actions/price-changes";
import { formatPrice } from "@/lib/invoice-utils";
import { mercadoLibreSearchUrl } from "@/lib/marketplace-links";
import { ShoppingBagIcon } from "@/components/icons";
import { loadDismissedIds, saveDismissedIds } from "@/lib/dismissed-ids";
import type { PriceChange } from "@/lib/types";
import { toast } from "sonner";

const DISMISSED_KEY = "sadona:dismissedPriceChanges";

export default function PriceChangesPage() {
  const [changes, setChanges] = useState<PriceChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState<Set<string>>(() =>
    loadDismissedIds(DISMISSED_KEY)
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const result = await getPriceChanges();
      if (cancelled) return;

      if (!result.success) {
        toast.error(result.error);
        setLoading(false);
        return;
      }

      setChanges(result.data as PriceChange[]);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleChanges = useMemo(
    () => changes.filter((c) => !dismissed.has(c.id)),
    [changes, dismissed]
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
    if (visibleChanges.length === 0) return;
    setDismissed((prev) => {
      const next = new Set(prev);
      for (const change of visibleChanges) next.add(change.id);
      saveDismissedIds(DISMISSED_KEY, next);
      return next;
    });
    toast.success("Lista de precios borrada");
  }

  return (
    <div className="page-container px-4 py-6">
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold text-white">
            Cambios de precio
          </h1>
          {!loading && visibleChanges.length > 0 && (
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-[#E0457B]/20 px-1.5 text-xs font-bold tabular-nums text-[#E0457B]">
              {visibleChanges.length}
            </span>
          )}
          {!loading && visibleChanges.length > 0 && (
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
          Se detectan automáticamente cuando una factura trae un precio
          distinto al que ya tenía el producto en el inventario.
        </p>
      </div>

      {loading ? (
        <div className="glass-card p-12 text-center text-white/50">
          Cargando cambios de precio...
        </div>
      ) : visibleChanges.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <p className="text-white/50">
            {changes.length > 0
              ? "Limpiaste todos los cambios de precio"
              : "Todavía no se detectó ningún cambio de precio"}
          </p>
          <p className="mt-1 text-xs text-white/30">
            {changes.length > 0
              ? "Los que se detecten de acá en más van a aparecer arriba."
              : "Subí una factura de un producto que ya tenga precio cargado y, si viene distinto, va a aparecer acá."}
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
                    <th className="px-4 py-3 font-medium">Precio anterior</th>
                    <th className="px-4 py-3 font-medium">Precio nuevo</th>
                    <th className="px-4 py-3 font-medium">Variación</th>
                    <th className="px-4 py-3 font-medium">Factura</th>
                    <th className="px-4 py-3 font-medium">Fecha</th>
                    <th className="px-4 py-3 font-medium">ML</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleChanges.map((change) => (
                    <tr
                      key={change.id}
                      className="border-b border-white/5 transition-colors hover:bg-white/[0.02]"
                    >
                      <td className="px-4 py-3 font-medium text-white">
                        <div className="flex items-center gap-2">
                          <span>{change.product_name}</span>
                          <button
                            type="button"
                            onClick={() => dismissOne(change.id)}
                            title="Quitar de la lista"
                            aria-label="Quitar de la lista"
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-white/30 transition-colors hover:bg-white/10 hover:text-white"
                          >
                            ✕
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-white/50">
                        {change.sku ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-white/50 line-through decoration-white/30">
                        {formatPrice(change.old_price)}
                      </td>
                      <td className="px-4 py-3 font-medium text-white">
                        {formatPrice(change.new_price)}
                      </td>
                      <td className="px-4 py-3">
                        <PriceDelta oldPrice={change.old_price} newPrice={change.new_price} />
                      </td>
                      <td className="px-4 py-3">
                        {change.invoice_id ? (
                          <Link
                            href={`/invoices/${change.invoice_id}`}
                            className="text-xs font-medium text-[#E0457B] hover:underline"
                          >
                            {change.invoices?.invoice_number ?? "Ver factura"}
                          </Link>
                        ) : (
                          <span className="text-white/30">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-white/50">
                        {new Date(change.created_at).toLocaleDateString("es-AR")}
                      </td>
                      <td className="px-4 py-3">
                        {change.sku ? (
                          <a
                            href={mercadoLibreSearchUrl(change.sku)}
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
            {visibleChanges.map((change) => (
              <div key={change.id} className="glass-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-semibold text-white">
                        {change.product_name}
                      </h3>
                      <button
                        type="button"
                        onClick={() => dismissOne(change.id)}
                        title="Quitar de la lista"
                        aria-label="Quitar de la lista"
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white/30 transition-colors hover:bg-white/10 hover:text-white"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <p className="font-mono text-xs text-white/50">
                        {change.sku ?? "—"}
                      </p>
                      {change.sku && (
                        <a
                          href={mercadoLibreSearchUrl(change.sku)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Ver en MercadoLibre"
                          aria-label="Ver en MercadoLibre"
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-yellow-400/30 text-yellow-400/90 transition-colors hover:bg-yellow-400/10"
                        >
                          <ShoppingBagIcon />
                        </a>
                      )}
                    </div>
                  </div>
                  <PriceDelta oldPrice={change.old_price} newPrice={change.new_price} />
                </div>
                <div className="mt-3 flex items-center gap-2 text-sm">
                  <span className="text-white/40 line-through decoration-white/30">
                    {formatPrice(change.old_price)}
                  </span>
                  <span className="text-white/30">→</span>
                  <span className="font-medium text-white">
                    {formatPrice(change.new_price)}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-white/40">
                  {change.invoice_id ? (
                    <Link
                      href={`/invoices/${change.invoice_id}`}
                      className="font-medium text-[#E0457B]"
                    >
                      {change.invoices?.invoice_number ?? "Ver factura"}
                    </Link>
                  ) : (
                    <span>—</span>
                  )}
                  <span>
                    {new Date(change.created_at).toLocaleDateString("es-AR")}
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

function PriceDelta({
  oldPrice,
  newPrice,
}: {
  oldPrice: number;
  newPrice: number;
}) {
  const diff = newPrice - oldPrice;
  const pct = oldPrice !== 0 ? (diff / oldPrice) * 100 : 0;
  const increased = diff > 0;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold tabular-nums ${
        increased
          ? "bg-red-500/10 text-red-400"
          : "bg-green-500/10 text-green-400"
      }`}
    >
      {increased ? "▲" : "▼"} {formatPrice(Math.abs(diff))} (
      {increased ? "+" : "−"}
      {Math.abs(pct).toFixed(1)}%)
    </span>
  );
}
