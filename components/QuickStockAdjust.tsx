"use client";

import { useState } from "react";
import { updateStock } from "@/app/actions/inventory";
import { toast } from "sonner";

type QuickStockAdjustProps = {
  productId: string;
  productName: string;
  onUpdated: (newStock: number) => void;
};

export default function QuickStockAdjust({
  productId,
  productName,
  onUpdated,
}: QuickStockAdjustProps) {
  const [mode, setMode] = useState<"plus" | "minus" | null>(null);
  const [amount, setAmount] = useState("1");
  const [loading, setLoading] = useState(false);

  async function handleConfirm(delta: number) {
    const qty = Math.abs(parseInt(amount, 10) || 1);
    setLoading(true);

    const result = await updateStock(productId, delta > 0 ? qty : -qty, "ajuste manual");

    setLoading(false);

    if (result.success && result.data) {
      toast.success(`${productName}: stock ${result.data.stock}`);
      onUpdated(result.data.stock);
      setMode(null);
      setAmount("1");
    } else if (!result.success) {
      toast.error(result.error);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent, delta: number) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleConfirm(delta);
    }
    if (e.key === "Escape") {
      setMode(null);
      setAmount("1");
    }
  }

  if (mode) {
    const isPlus = mode === "plus";
    return (
      <div className="flex items-center gap-1">
        <input
          type="number"
          min="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => handleKeyDown(e, isPlus ? 1 : -1)}
          autoFocus
          className="w-14 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-center text-sm text-white outline-none focus:border-[#E0457B]/50"
        />
        <button
          type="button"
          disabled={loading}
          onClick={() => handleConfirm(isPlus ? 1 : -1)}
          className={`rounded-lg px-2 py-1 text-xs font-semibold text-white transition-colors disabled:opacity-50 ${
            isPlus
              ? "bg-green-500/80 hover:bg-green-500"
              : "bg-red-500/80 hover:bg-red-500"
          }`}
        >
          ✓
        </button>
        <button
          type="button"
          onClick={() => {
            setMode(null);
            setAmount("1");
          }}
          className="rounded-lg px-1.5 py-1 text-xs text-white/50 hover:text-white"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => setMode("minus")}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-sm font-bold text-white/70 transition-colors hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400"
        title="Descontar stock"
      >
        −
      </button>
      <button
        type="button"
        onClick={() => setMode("plus")}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-sm font-bold text-white/70 transition-colors hover:border-green-500/30 hover:bg-green-500/10 hover:text-green-400"
        title="Agregar stock"
      >
        +
      </button>
    </div>
  );
}
