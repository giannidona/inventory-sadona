"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { deleteProduct } from "@/app/actions/inventory";
import BarcodeScanner from "@/components/BarcodeScanner";
import ConfirmDialog from "@/components/ConfirmDialog";
import EditProductModal from "@/components/EditProductModal";
import MovementsModal from "@/components/MovementsModal";
import QuickStockAdjust from "@/components/QuickStockAdjust";
import ScanStockModal from "@/components/ScanStockModal";
import { createBrowserClient } from "@/lib/supabase/client";
import {
  calculateInvestmentWithIva,
  formatPrice,
} from "@/lib/invoice-utils";
import {
  loadDismissedLowStock,
  loadLowStockThreshold,
  onLowStockThresholdChange,
  saveDismissedLowStock,
  saveLowStockThreshold,
  type DismissedLowStockMap,
} from "@/lib/low-stock";
import ProductActionIcons from "@/components/ProductActionIcons";
import {
  loadViewPreferences,
  saveViewPreferences,
  type SortMode,
} from "@/lib/view-preferences";
import type { InventoryItem } from "@/lib/types";
import { toast } from "sonner";

type InventoryDashboardProps = {
  title?: string;
  /** Locks the view to only show low-stock products (used by /notifications). */
  lockToLowStock?: boolean;
};

export default function InventoryDashboard({
  title = "Inventario",
  lockToLowStock = false,
}: InventoryDashboardProps) {
  const searchParams = useSearchParams();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(() => loadViewPreferences().search);
  const [sortMode, setSortMode] = useState<SortMode>(
    () => loadViewPreferences().sortMode
  );
  const [lowStockThreshold, setLowStockThreshold] = useState<number>(
    () => loadLowStockThreshold()
  );
  const [thresholdInput, setThresholdInput] = useState<string>(() =>
    String(loadLowStockThreshold())
  );
  const [lowStockOnly, setLowStockOnly] = useState(
    () =>
      lockToLowStock ||
      searchParams.get("low") === "1" ||
      loadViewPreferences().lowStockOnly
  );
  const [dismissed, setDismissed] = useState<DismissedLowStockMap>(() =>
    lockToLowStock ? loadDismissedLowStock() : {}
  );
  const [editProduct, setEditProduct] = useState<InventoryItem | null>(null);
  const [historyProduct, setHistoryProduct] = useState<InventoryItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InventoryItem | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanProduct, setScanProduct] = useState<InventoryItem | null>(null);
  const [notFoundEan, setNotFoundEan] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const supabase = createBrowserClient();
      const { data, error } = await supabase
        .from("inventory")
        .select("*")
        .order("name");

      if (cancelled) return;

      if (error) {
        toast.error("Error al cargar inventario");
        return;
      }
      setItems(data ?? []);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return onLowStockThresholdChange((value) => {
      setLowStockThreshold(value);
      setThresholdInput(String(value));
    });
  }, []);

  useEffect(() => {
    saveViewPreferences({ search, sortMode });
  }, [search, sortMode]);

  useEffect(() => {
    // On /notifications, lowStockOnly is always forced true — don't let that
    // overwrite the toggle's saved state on the main inventory page.
    if (lockToLowStock) return;
    saveViewPreferences({ lowStockOnly });
  }, [lowStockOnly, lockToLowStock]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = !q
      ? items
      : items.filter(
          (item) =>
            item.name.toLowerCase().includes(q) ||
            item.sku.toLowerCase().includes(q) ||
            (item.ean?.toLowerCase().includes(q) ?? false)
        );

    if (lowStockOnly) {
      list = list.filter((item) => item.stock <= lowStockThreshold);
    }

    if (lockToLowStock) {
      list = list.filter((item) => dismissed[item.id] !== item.stock);
    }

    if (sortMode === "stock-desc" || sortMode === "stock-asc") {
      return [...list].sort((a, b) => {
        const diff =
          sortMode === "stock-desc" ? b.stock - a.stock : a.stock - b.stock;
        return diff !== 0 ? diff : a.name.localeCompare(b.name);
      });
    }

    if (sortMode === "newest" || sortMode === "oldest") {
      return [...list].sort((a, b) => {
        const diff =
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        return sortMode === "newest" ? diff : -diff;
      });
    }

    return list;
  }, [
    items,
    search,
    sortMode,
    lowStockOnly,
    lowStockThreshold,
    lockToLowStock,
    dismissed,
  ]);

  const lowStockCount = useMemo(
    () => items.filter((item) => item.stock <= lowStockThreshold).length,
    [items, lowStockThreshold]
  );

  function cycleStockSort() {
    setSortMode((prev) =>
      prev === "stock-desc" ? "stock-asc" : prev === "stock-asc" ? "name" : "stock-desc"
    );
  }

  function cycleDateSort() {
    setSortMode((prev) =>
      prev === "newest" ? "oldest" : prev === "oldest" ? "name" : "newest"
    );
  }

  function saveThreshold() {
    const value = parseInt(thresholdInput, 10);
    if (!Number.isFinite(value) || value < 0) {
      toast.error("Ingresá un número válido");
      return;
    }
    setLowStockThreshold(value);
    saveLowStockThreshold(value);
    toast.success(`Alerta configurada en esta computadora: stock ≤ ${value}`);
  }

  const thresholdChanged = thresholdInput !== String(lowStockThreshold);

  function dismissItem(id: string, stock: number) {
    setDismissed((prev) => {
      const next = { ...prev, [id]: stock };
      saveDismissedLowStock(next);
      return next;
    });
  }

  function dismissAll() {
    if (filtered.length === 0) return;
    setDismissed((prev) => {
      const next = { ...prev };
      for (const item of filtered) next[item.id] = item.stock;
      saveDismissedLowStock(next);
      return next;
    });
    toast.success("Notificaciones borradas");
  }

  const totalInvestment = useMemo(
    () =>
      items.reduce(
        (sum, item) =>
          sum + (calculateInvestmentWithIva(item.unit_price, item.stock) ?? 0),
        0
      ),
    [items]
  );

  function updateLocalStock(id: string, stock: number) {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, stock } : item))
    );
  }

  async function refreshItems() {
    const supabase = createBrowserClient();
    const { data, error } = await supabase
      .from("inventory")
      .select("*")
      .order("name");

    if (error) {
      toast.error("Error al cargar inventario");
      return;
    }
    setItems(data ?? []);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const result = await deleteProduct(deleteTarget.id);
    if (result.success) {
      toast.success(`${deleteTarget.name} eliminado`);
      setItems((prev) => prev.filter((i) => i.id !== deleteTarget.id));
    } else {
      toast.error(result.error);
    }
    setDeleteTarget(null);
  }

  const lookupByEan = useCallback(async (ean: string) => {
    const supabase = createBrowserClient();
    const { data } = await supabase
      .from("inventory")
      .select("*")
      .eq("ean", ean)
      .maybeSingle();

    if (data) {
      setScanProduct(data);
    } else {
      setNotFoundEan(ean);
    }
  }, []);

  function closeCamera() {
    setCameraActive(false);
    setCameraError(null);
    setScanProduct(null);
    setNotFoundEan(null);
  }

  function handleScanApplied(newStock: number) {
    if (scanProduct) {
      updateLocalStock(scanProduct.id, newStock);
    }
    setScanProduct(null);
  }

  const scannerActive =
    cameraActive && !scanProduct && !notFoundEan && !cameraError;

  return (
    <div className="page-container px-4 py-6">
      <div className="mb-6 flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-white">{title}</h1>
              {!loading && (
                <span
                  className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#E0457B]/20 px-1.5 text-[11px] font-bold tabular-nums text-[#E0457B]"
                  title={
                    search.trim() || lockToLowStock
                      ? `${filtered.length} de ${items.length} productos`
                      : `${items.length} productos`
                  }
                >
                  {search.trim() || lockToLowStock ? filtered.length : items.length}
                </span>
              )}
              {lockToLowStock && !loading && filtered.length > 0 && (
                <button
                  type="button"
                  onClick={dismissAll}
                  className="text-xs font-medium text-white/50 transition-colors hover:text-white"
                >
                  Limpiar todo
                </button>
              )}
            </div>
            {lockToLowStock ? (
              <p className="mt-1 text-sm text-white/50">
                Productos con stock igual o menor al umbral de alerta.
              </p>
            ) : (
              !loading &&
              items.length > 0 && (
                <p className="mt-1 text-sm text-white/50">
                  Total invertido{" "}
                  <span className="font-medium text-[#E0457B]">
                    {formatPrice(totalInvestment)}
                  </span>
                  <span className="text-white/40"> (precio × stock + 21% IVA)</span>
                </p>
              )
            )}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="search"
              placeholder="Buscar por nombre, SKU o EAN..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input w-full sm:max-w-md"
            />
            {!lockToLowStock && lowStockCount > 0 && (
              <button
                type="button"
                onClick={() => setLowStockOnly((v) => !v)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-semibold transition-colors sm:py-2 ${
                  lowStockOnly
                    ? "border-yellow-400/40 bg-yellow-400/10 text-yellow-400"
                    : "border-white/10 text-white/60 hover:bg-white/5"
                }`}
                title="Filtrar productos con stock bajo"
              >
                <WarningIcon />
                Stock bajo ({lowStockCount})
              </button>
            )}
            <button
              type="button"
              onClick={cycleDateSort}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-semibold transition-colors sm:py-2 ${
                sortMode === "newest" || sortMode === "oldest"
                  ? "border-[#E0457B]/40 bg-[#E0457B]/10 text-[#E0457B]"
                  : "border-white/10 text-white/60 hover:bg-white/5"
              }`}
              title={
                sortMode === "newest"
                  ? "Ordenado: más nuevos primero (clic para invertir)"
                  : sortMode === "oldest"
                    ? "Ordenado: más antiguos primero (clic para quitar)"
                    : "Ordenar por fecha de creación"
              }
            >
              <RecentIcon />
              {sortMode === "oldest" ? "Más antiguos" : "Recientes"}
            </button>
          </div>
        </div>

        {lockToLowStock && (
          <div className="glass-card flex flex-wrap items-center gap-2 px-4 py-3">
            <label htmlFor="low-stock-threshold-input" className="text-sm text-white/60">
              Avisarme cuando el stock sea ≤
            </label>
            <input
              id="low-stock-threshold-input"
              type="number"
              min="0"
              value={thresholdInput}
              onChange={(e) => setThresholdInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveThreshold()}
              className="w-20 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-center text-sm font-semibold text-white outline-none focus:border-[#E0457B]/50"
            />
            {thresholdChanged && (
              <button
                type="button"
                onClick={saveThreshold}
                className="rounded-lg bg-[#E0457B] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#c93a6a]"
              >
                Guardar
              </button>
            )}
            <span className="text-xs text-white/30">
              (se guarda solo en esta computadora)
            </span>
          </div>
        )}

        {!lockToLowStock && (
          <div className="flex flex-col gap-3">
            {cameraActive ? (
              <button
                type="button"
                onClick={closeCamera}
                className="w-full rounded-xl bg-red-500 py-3 text-sm font-bold text-white transition-colors hover:bg-red-600 sm:w-auto sm:px-6"
              >
                ✕ Cerrar cámara
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setCameraError(null);
                  setCameraActive(true);
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#E0457B] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#c93a6a] sm:w-auto sm:px-6"
              >
                <CameraIcon />
                Escanear
              </button>
            )}

            {cameraActive && (
              <div className="space-y-2">
                <BarcodeScanner
                  active={scannerActive}
                  onScan={lookupByEan}
                  onError={(msg) => {
                    setCameraError(msg);
                    toast.error(msg);
                  }}
                />
                {cameraError && (
                  <p className="text-center text-sm text-red-400">{cameraError}</p>
                )}
                {scannerActive && (
                  <p className="text-center text-sm text-white/50">
                    Apuntá la cámara al código de barras
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className="glass-card p-12 text-center text-white/50">
          Cargando inventario...
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-12 text-center text-white/50">
          {search
            ? "No se encontraron productos"
            : lockToLowStock
              ? "Ningún producto está con stock bajo ahora mismo"
              : "No hay productos en el inventario"}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="glass-card hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-white/50">
                    <th className="px-4 py-3 font-medium">Nombre</th>
                    <th className="px-4 py-3 font-medium">SKU</th>
                    <th className="px-4 py-3 font-medium">EAN</th>
                    <th className="px-4 py-3 font-medium">
                      <button
                        type="button"
                        onClick={cycleStockSort}
                        className="inline-flex items-center gap-1 transition-colors hover:text-white"
                        title={
                          sortMode === "stock-desc"
                            ? "Ordenado: mayor a menor stock"
                            : sortMode === "stock-asc"
                              ? "Ordenado: menor a mayor stock"
                              : "Ordenar por stock"
                        }
                      >
                        Stock
                        <StockSortIcon
                          sort={
                            sortMode === "stock-desc"
                              ? "desc"
                              : sortMode === "stock-asc"
                                ? "asc"
                                : null
                          }
                        />
                      </button>
                    </th>
                    <th className="px-4 py-3 font-medium">Precio</th>
                    <th className="px-4 py-3 font-medium">Inversión</th>
                    <th className="px-4 py-3 font-medium">Marca</th>
                    <th className="px-4 py-3 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-white/5 transition-colors hover:bg-white/[0.02]"
                    >
                      <td className="px-4 py-3 font-medium text-white">
                        <div className="flex items-center gap-2">
                          <span>{item.name}</span>
                          {lockToLowStock && (
                            <button
                              type="button"
                              onClick={() => dismissItem(item.id, item.stock)}
                              title="Quitar de notificaciones"
                              aria-label="Quitar de notificaciones"
                              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-white/30 transition-colors hover:bg-white/10 hover:text-white"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-white/70">{item.sku}</td>
                      <td className="px-4 py-3 font-mono text-white/50">
                        {item.ean ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <QuickStockAdjust
                          productId={item.id}
                          productName={item.name}
                          stock={item.stock}
                          onUpdated={(stock) => updateLocalStock(item.id, stock)}
                        />
                      </td>
                      <td className="px-4 py-3 text-white/70">
                        {formatPrice(item.unit_price)}
                      </td>
                      <td className="px-4 py-3 font-medium text-[#E0457B]/90">
                        {formatPrice(
                          calculateInvestmentWithIva(item.unit_price, item.stock)
                        )}
                      </td>
                      <td className="px-4 py-3 text-white/60">
                        {item.marca ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <ProductActionIcons
                          sku={item.sku}
                          onEdit={() => setEditProduct(item)}
                          onHistory={() => setHistoryProduct(item)}
                          onDelete={() => setDeleteTarget(item)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {filtered.map((item) => (
              <div key={item.id} className="glass-card p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold text-white">{item.name}</h3>
                      {lockToLowStock && (
                        <button
                          type="button"
                          onClick={() => dismissItem(item.id, item.stock)}
                          title="Quitar de notificaciones"
                          aria-label="Quitar de notificaciones"
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white/30 transition-colors hover:bg-white/10 hover:text-white"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    <p className="mt-0.5 font-mono text-xs text-white/50">
                      {item.sku}
                      {item.ean && ` · ${item.ean}`}
                    </p>
                    {item.marca && (
                      <p className="mt-1 text-xs text-white/40">{item.marca}</p>
                    )}
                    <p className="mt-1 text-xs text-white/50">
                      {formatPrice(item.unit_price)}
                    </p>
                    <p className="mt-0.5 text-xs font-medium text-[#E0457B]/90">
                      Inversión:{" "}
                      {formatPrice(
                        calculateInvestmentWithIva(item.unit_price, item.stock)
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <QuickStockAdjust
                    productId={item.id}
                    productName={item.name}
                    stock={item.stock}
                    onUpdated={(stock) => updateLocalStock(item.id, stock)}
                  />
                  <ProductActionIcons
                    sku={item.sku}
                    onEdit={() => setEditProduct(item)}
                    onHistory={() => setHistoryProduct(item)}
                    onDelete={() => setDeleteTarget(item)}
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <EditProductModal
        product={editProduct}
        onClose={() => setEditProduct(null)}
        onSaved={refreshItems}
      />

      <MovementsModal
        product={historyProduct}
        onClose={() => setHistoryProduct(null)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Eliminar producto"
        message={`¿Estás seguro de eliminar "${deleteTarget?.name}"? Esta acción no se puede deshacer.`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {scanProduct && (
        <ScanStockModal
          product={scanProduct}
          onClose={() => setScanProduct(null)}
          onApplied={handleScanApplied}
        />
      )}

      {notFoundEan && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1a1a1a]/95 p-6 shadow-2xl backdrop-blur-xl">
            <h2 className="text-lg font-semibold text-white">Producto no encontrado</h2>
            <p className="mt-2 font-mono text-sm text-white/50">EAN: {notFoundEan}</p>
            <div className="mt-5 flex flex-col gap-2">
              <Link
                href={`/add?ean=${encodeURIComponent(notFoundEan)}`}
                className="rounded-xl bg-[#E0457B] py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-[#c93a6a]"
              >
                Crear producto con este EAN
              </Link>
              <button
                type="button"
                onClick={() => setNotFoundEan(null)}
                className="rounded-xl border border-white/10 py-2.5 text-sm font-medium text-white/60 transition-colors hover:bg-white/5"
              >
                Escanear otro
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StockSortIcon({ sort }: { sort: "asc" | "desc" | null }) {
  if (sort === "desc") {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-3.5 w-3.5 text-[#E0457B]"
        aria-hidden
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    );
  }
  if (sort === "asc") {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-3.5 w-3.5 text-[#E0457B]"
        aria-hidden
      >
        <path d="m18 15-6-6-6 6" />
      </svg>
    );
  }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5 opacity-40"
      aria-hidden
    >
      <path d="m7 15 5 5 5-5" />
      <path d="m7 9 5-5 5 5" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
      aria-hidden
    >
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}

function RecentIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

