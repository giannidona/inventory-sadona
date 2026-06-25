"use client";

import { useState } from "react";
import { updateStock } from "@/app/actions/inventory";
import { toast } from "sonner";

type QuickStockAdjustProps = {
  productId: string;
  productName: string;
  stock: number;
  onUpdated: (newStock: number) => void;
};

function stockTextColor(stock: number) {
  if (stock === 0) return "text-red-400";
  if (stock <= 5) return "text-yellow-400";
  return "text-green-400";
}

export default function QuickStockAdjust({
  productId,
  productName,
  stock,
  onUpdated,
}: QuickStockAdjustProps) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState("1");
  const [loading, setLoading] = useState(false);

  async function adjust(delta: number) {
    const qty = editing ? Math.abs(parseInt(amount, 10) || 1) : 1;
    const actualDelta = delta > 0 ? qty : -qty;

    setLoading(true);
    const result = await updateStock(
      productId,
      actualDelta,
      editing ? "ajuste manual" : "ajuste rápido"
    );
    setLoading(false);

    if (result.success && result.data) {
      onUpdated(result.data.stock);
      if (editing) {
        toast.success(`${productName}: stock ${result.data.stock}`);
        setEditing(false);
        setAmount("1");
      }
    } else if (!result.success) {
      toast.error(result.error);
    }
  }

  function cancelEdit() {
    setEditing(false);
    setAmount("1");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      adjust(1);
    }
    if (e.key === "Escape") cancelEdit();
  }

  if (editing) {
    return (
      <div className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 p-0.5">
        <button
          type="button"
          disabled={loading}
          onClick={() => adjust(-1)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm font-bold text-red-400 transition-colors hover:bg-red-500/15 disabled:opacity-50"
          title="Quitar cantidad"
        >
          −
        </button>
        <input
          type="number"
          min="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
          className="w-12 rounded-md border border-white/10 bg-white/5 px-1 py-1 text-center text-sm font-semibold text-white outline-none focus:border-[#E0457B]/50"
        />
        <button
          type="button"
          disabled={loading}
          onClick={() => adjust(1)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm font-bold text-green-400 transition-colors hover:bg-green-500/15 disabled:opacity-50"
          title="Agregar cantidad"
        >
          +
        </button>
        <button
          type="button"
          onClick={cancelEdit}
          className="flex h-8 w-6 shrink-0 items-center justify-center text-xs text-white/40 hover:text-white"
          title="Cancelar"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div className="inline-flex items-center rounded-lg border border-white/10 bg-white/5 p-0.5">
      <button
        type="button"
        disabled={loading || stock === 0}
        onClick={() => adjust(-1)}
        className="flex h-8 w-8 items-center justify-center rounded-md text-sm font-bold text-white/60 transition-colors hover:bg-red-500/15 hover:text-red-400 disabled:opacity-30"
        title="Quitar 1"
      >
        −
      </button>
      <button
        type="button"
        disabled={loading}
        onClick={() => setEditing(true)}
        className={`min-w-[2.25rem] px-1.5 py-1 text-sm font-bold tabular-nums transition-colors hover:bg-white/5 ${stockTextColor(stock)}`}
        title="Clic para ajustar cantidad"
      >
        {loading ? "…" : stock}
      </button>
      <button
        type="button"
        disabled={loading}
        onClick={() => adjust(1)}
        className="flex h-8 w-8 items-center justify-center rounded-md text-sm font-bold text-white/60 transition-colors hover:bg-green-500/15 hover:text-green-400 disabled:opacity-50"
        title="Agregar 1"
      >
        +
      </button>
    </div>
  );
}
