"use client";

import { useEffect, useMemo, useState } from "react";
import { deleteProduct } from "@/app/actions/inventory";
import ConfirmDialog from "@/components/ConfirmDialog";
import EditProductModal from "@/components/EditProductModal";
import MovementsModal from "@/components/MovementsModal";
import QuickStockAdjust from "@/components/QuickStockAdjust";
import StockBadge from "@/components/StockBadge";
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

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-6">
        <input
          type="search"
          placeholder="Buscar por nombre, SKU o EAN..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input w-full max-w-md"
        />
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
                      <StockBadge stock={item.stock} />
                    </td>
                    <td className="px-4 py-3 text-white/70">
                      {formatPrice(item.unit_price)}
                    </td>
                    <td className="px-4 py-3 text-white/60">
                      {item.marca ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <RowActions
                        item={item}
                        onStockUpdated={(stock) => updateLocalStock(item.id, stock)}
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
                  <StockBadge stock={item.stock} />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <QuickStockAdjust
                    productId={item.id}
                    productName={item.name}
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
    </div>
  );
}

function RowActions({
  item,
  onStockUpdated,
  onEdit,
  onHistory,
  onDelete,
}: {
  item: InventoryItem;
  onStockUpdated: (stock: number) => void;
  onEdit: () => void;
  onHistory: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <QuickStockAdjust
        productId={item.id}
        productName={item.name}
        onUpdated={onStockUpdated}
      />
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
