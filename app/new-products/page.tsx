"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getNewProducts } from "@/app/actions/new-products";
import { doanProductUrl, mercadoLibreSearchUrl } from "@/lib/marketplace-links";
import { ExternalLinkIcon, ShoppingBagIcon } from "@/components/icons";
import { loadDismissedIds, saveDismissedIds } from "@/lib/dismissed-ids";
import type { StockArrival } from "@/lib/types";
import { toast } from "sonner";

const DISMISSED_KEY = "sadona:dismissedNewProducts";

export default function NewProductsPage() {
  const [products, setProducts] = useState<StockArrival[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState<Set<string>>(() =>
    loadDismissedIds(DISMISSED_KEY)
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const result = await getNewProducts();
      if (cancelled) return;

      if (!result.success) {
        toast.error(result.error);
        setLoading(false);
        return;
      }

      setProducts(result.data as StockArrival[]);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleProducts = useMemo(
    () => products.filter((p) => !dismissed.has(p.id)),
    [products, dismissed]
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
    if (visibleProducts.length === 0) return;
    setDismissed((prev) => {
      const next = new Set(prev);
      for (const product of visibleProducts) next.add(product.id);
      saveDismissedIds(DISMISSED_KEY, next);
      return next;
    });
    toast.success("Lista de productos nuevos borrada");
  }

  return (
    <div className="page-container px-4 py-6">
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold text-white">
            Productos nuevos
          </h1>
          {!loading && visibleProducts.length > 0 && (
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-[#E0457B]/20 px-1.5 text-xs font-bold tabular-nums text-[#E0457B]">
              {visibleProducts.length}
            </span>
          )}
          {!loading && visibleProducts.length > 0 && (
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
          Productos que no existían en el inventario y se crearon al subir
          una factura. Marcá cada uno como listo (✕) una vez que lo
          publicaste en las otras plataformas.
        </p>
      </div>

      {loading ? (
        <div className="glass-card p-12 text-center text-white/50">
          Cargando productos nuevos...
        </div>
      ) : visibleProducts.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <p className="text-white/50">
            {products.length > 0
              ? "Limpiaste todos los productos nuevos"
              : "Todavía no se creó ningún producto por factura"}
          </p>
          <p className="mt-1 text-xs text-white/30">
            {products.length > 0
              ? "Los que se creen de acá en más van a aparecer arriba."
              : "Subí una factura y cada producto que no exista todavía va a aparecer acá."}
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
                    <th className="px-4 py-3 font-medium">Stock inicial</th>
                    <th className="px-4 py-3 font-medium">Precio</th>
                    <th className="px-4 py-3 font-medium">Factura</th>
                    <th className="px-4 py-3 font-medium">Fecha</th>
                    <th className="px-4 py-3 font-medium">Doan</th>
                    <th className="px-4 py-3 font-medium">ML</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleProducts.map((product) => (
                    <tr
                      key={product.id}
                      className="border-b border-white/5 transition-colors hover:bg-white/[0.02]"
                    >
                      <td className="px-4 py-3 font-medium text-white">
                        <div className="flex items-center gap-2">
                          <span>{product.product_name}</span>
                          <button
                            type="button"
                            onClick={() => dismissOne(product.id)}
                            title="Quitar de la lista"
                            aria-label="Quitar de la lista"
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-white/30 transition-colors hover:bg-white/10 hover:text-white"
                          >
                            ✕
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-white/50">
                        {product.sku ?? "—"}
                      </td>
                      <td className="px-4 py-3 font-mono text-white/50">
                        {product.ean ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-lg bg-green-500/10 px-2 py-1 text-xs font-semibold tabular-nums text-green-400">
                          {product.new_stock}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold tabular-nums text-white">
                        {product.unit_price != null
                          ? `$ ${product.unit_price.toLocaleString("es-AR", {
                              minimumFractionDigits: 2,
                            })}`
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {product.invoice_id ? (
                          <Link
                            href={`/invoices/${product.invoice_id}`}
                            className="text-xs font-medium text-[#E0457B] hover:underline"
                          >
                            {product.invoices?.invoice_number ?? "Ver factura"}
                          </Link>
                        ) : (
                          <span className="text-white/30">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-white/50">
                        {new Date(product.created_at).toLocaleDateString("es-AR")}
                      </td>
                      <td className="px-4 py-3">
                        {product.sku ? (
                          <a
                            href={doanProductUrl(product.sku)}
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
                        {product.sku ? (
                          <a
                            href={mercadoLibreSearchUrl(product.sku)}
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
            {visibleProducts.map((product) => (
              <div key={product.id} className="glass-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-semibold text-white">
                        {product.product_name}
                      </h3>
                      <button
                        type="button"
                        onClick={() => dismissOne(product.id)}
                        title="Quitar de la lista"
                        aria-label="Quitar de la lista"
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white/30 transition-colors hover:bg-white/10 hover:text-white"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2">
                      <p className="font-mono text-xs text-white/50">
                        {product.sku ?? "—"}
                        {product.ean && ` · ${product.ean}`}
                      </p>
                      {product.sku && (
                        <div className="flex items-center gap-1.5">
                          <a
                            href={doanProductUrl(product.sku)}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Ver en Doan"
                            aria-label="Ver en Doan"
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[#E0457B]/30 text-[#E0457B]/90"
                          >
                            <ExternalLinkIcon />
                          </a>
                          <a
                            href={mercadoLibreSearchUrl(product.sku)}
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
                    {product.new_stock} u.
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-2 text-sm">
                  <span className="text-white/40">Precio:</span>
                  <span className="font-semibold tabular-nums text-white">
                    {product.unit_price != null
                      ? `$ ${product.unit_price.toLocaleString("es-AR", {
                          minimumFractionDigits: 2,
                        })}`
                      : "—"}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-white/40">
                  {product.invoice_id ? (
                    <Link
                      href={`/invoices/${product.invoice_id}`}
                      className="font-medium text-[#E0457B]"
                    >
                      {product.invoices?.invoice_number ?? "Ver factura"}
                    </Link>
                  ) : (
                    <span>—</span>
                  )}
                  <span>
                    {new Date(product.created_at).toLocaleDateString("es-AR")}
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
