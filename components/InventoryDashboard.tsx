"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { deleteProduct } from "@/app/actions/inventory";
import BarcodeScanner from "@/components/BarcodeScanner";
import ConfirmDialog from "@/components/ConfirmDialog";
import EditProductModal from "@/components/EditProductModal";
import MovementsModal from "@/components/MovementsModal";
import QuickStockAdjust from "@/components/QuickStockAdjust";
import ScanStockModal from "@/components/ScanStockModal";
import { createBrowserClient } from "@/lib/supabase/client";
import { formatPrice } from "@/lib/invoice-utils";
import type { InventoryItem } from "@/lib/types";
import { toast } from "sonner";

export default function InventoryDashboard() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q) ||
        (item.ean?.toLowerCase().includes(q) ?? false)
    );
  }, [items, search]);

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
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-6 flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-white">Inventario</h1>
            {!loading && (
              <span
                className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#E0457B]/20 px-1.5 text-[11px] font-bold tabular-nums text-[#E0457B]"
                title={
                  search.trim()
                    ? `${filtered.length} de ${items.length} productos`
                    : `${items.length} productos`
                }
              >
                {search.trim() ? filtered.length : items.length}
              </span>
            )}
          </div>
          <input
            type="search"
            placeholder="Buscar por nombre, SKU o EAN..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input w-full sm:max-w-md"
          />
        </div>

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
      </div>

      {loading ? (
        <div className="glass-card p-12 text-center text-white/50">
          Cargando inventario...
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-12 text-center text-white/50">
          {search ? "No se encontraron productos" : "No hay productos en el inventario"}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="glass-card hidden overflow-hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-white/50">
                  <th className="px-4 py-3 font-medium">Nombre</th>
                  <th className="px-4 py-3 font-medium">SKU</th>
                  <th className="px-4 py-3 font-medium">EAN</th>
                  <th className="px-4 py-3 font-medium">Stock</th>
                  <th className="px-4 py-3 font-medium">Precio</th>
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
                    <td className="px-4 py-3 font-medium text-white">{item.name}</td>
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
                    <td className="px-4 py-3 text-white/60">
                      {item.marca ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <RowActions
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

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {filtered.map((item) => (
              <div key={item.id} className="glass-card p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-white">{item.name}</h3>
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
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <QuickStockAdjust
                    productId={item.id}
                    productName={item.name}
                    stock={item.stock}
                    onUpdated={(stock) => updateLocalStock(item.id, stock)}
                  />
                  <button
                    type="button"
                    onClick={() => setHistoryProduct(item)}
                    className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-white/60 transition-colors hover:bg-white/5"
                  >
                    Historial
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditProduct(item)}
                    className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-white/60 transition-colors hover:bg-white/5"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(item)}
                    className="rounded-lg border border-red-500/20 px-3 py-1.5 text-xs font-medium text-red-400/80 transition-colors hover:bg-red-500/10"
                  >
                    Eliminar
                  </button>
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

function RowActions({
  onEdit,
  onHistory,
  onDelete,
}: {
  onEdit: () => void;
  onHistory: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onHistory}
        className="rounded-lg border border-white/10 px-2.5 py-1 text-xs font-medium text-white/60 transition-colors hover:bg-white/5"
      >
        Ver historial
      </button>
      <button
        type="button"
        onClick={onEdit}
        className="rounded-lg border border-white/10 px-2.5 py-1 text-xs font-medium text-white/60 transition-colors hover:bg-white/5"
      >
        Editar
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="rounded-lg border border-red-500/20 px-2.5 py-1 text-xs font-medium text-red-400/80 transition-colors hover:bg-red-500/10"
      >
        Eliminar
      </button>
    </div>
  );
}
