"use client";

import { useState } from "react";
import { updateStock } from "@/app/actions/inventory";
import type { InventoryItem } from "@/lib/types";
import { toast } from "sonner";

type ScanStockModalProps = {
  product: InventoryItem;
  onClose: () => void;
  onApplied: (newStock: number) => void;
};

export default function ScanStockModal({
  product,
  onClose,
  onApplied,
}: ScanStockModalProps) {
  const [delta, setDelta] = useState(0);
  const [applying, setApplying] = useState(false);

  const newTotal = product.stock + delta;
  const canApply = delta !== 0 && newTotal >= 0;

  function adjust(amount: number) {
    setDelta((prev) => {
      const next = prev + amount;
      if (product.stock + next < 0) return prev;
      return next;
    });
  }

  async function handleApply() {
    if (!canApply) return;
    setApplying(true);

    const result = await updateStock(product.id, delta, "scanner");

    setApplying(false);

    if (result.success && result.data) {
      toast.success(`Stock actualizado: ${result.data.stock}`);
      onApplied(result.data.stock);
    } else if (!result.success) {
      toast.error(result.error);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1a1a1a]/95 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-white">{product.name}</h2>
            <p className="mt-0.5 font-mono text-xs text-white/50">
              {product.sku}
              {product.ean && ` · ${product.ean}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-white/50 transition-colors hover:bg-white/5 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="space-y-5 p-6">
          <div className="flex items-center justify-center gap-4">
            <button
              type="button"
              disabled={applying}
              onClick={() => adjust(-1)}
              className="flex h-14 w-14 items-center justify-center rounded-xl bg-red-500/20 text-2xl font-bold text-red-400 transition-colors hover:bg-red-500/30 disabled:opacity-50"
            >
              −
            </button>
            <div className="min-w-[4rem] text-center">
              <span
                className={`text-3xl font-bold tabular-nums ${
                  delta > 0
                    ? "text-green-400"
                    : delta < 0
                      ? "text-red-400"
                      : "text-white/40"
                }`}
              >
                {delta > 0 ? `+${delta}` : delta === 0 ? "0" : delta}
              </span>
            </div>
            <button
              type="button"
              disabled={applying}
              onClick={() => adjust(1)}
              className="flex h-14 w-14 items-center justify-center rounded-xl bg-green-500/20 text-2xl font-bold text-green-400 transition-colors hover:bg-green-500/30 disabled:opacity-50"
            >
              +
            </button>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-white/50">Stock anterior</span>
              <span className="font-semibold tabular-nums text-white">
                {product.stock}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/50">Ajuste</span>
              <span
                className={`font-semibold tabular-nums ${
                  delta > 0
                    ? "text-green-400"
                    : delta < 0
                      ? "text-red-400"
                      : "text-white/40"
                }`}
              >
                {delta > 0 ? `+${delta}` : delta}
              </span>
            </div>
            <div className="border-t border-white/10 pt-2 flex justify-between">
              <span className="font-medium text-white/70">Total</span>
              <span className="text-lg font-bold tabular-nums text-white">
                {newTotal}
              </span>
            </div>
          </div>

          <button
            type="button"
            disabled={!canApply || applying}
            onClick={handleApply}
            className="w-full rounded-xl bg-[#E0457B] py-3.5 text-sm font-semibold text-white transition-colors hover:bg-[#c93a6a] disabled:opacity-40"
          >
            {applying ? "Aplicando…" : "Aplicar"}
          </button>
        </div>
      </div>
    </div>
  );
}
