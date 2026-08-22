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
  const [step, setStep] = useState("1");
  // +/- clicks only adjust this local counter — nothing hits the server
  // until "Guardar" is pressed. Previously every click fired its own
  // request, so clicking fast made the displayed number jump around and
  // made it impossible to tell if the app was lagging or double-counting.
  const [pendingDelta, setPendingDelta] = useState(0);
  const [saving, setSaving] = useState(false);

  const displayStock = stock + pendingDelta;
  const dirty = pendingDelta !== 0;

  function bump(sign: 1 | -1) {
    const qty = editing ? Math.abs(parseInt(step, 10) || 1) : 1;
    setPendingDelta((prev) => prev + sign * qty);
  }

  function discard() {
    setPendingDelta(0);
    setEditing(false);
    setStep("1");
  }

  async function save() {
    if (pendingDelta === 0) return;
    setSaving(true);
    const result = await updateStock(
      productId,
      pendingDelta,
      editing ? "ajuste manual" : "ajuste rápido"
    );
    setSaving(false);

    if (result.success && result.data) {
      onUpdated(result.data.stock);
      toast.success(`${productName}: stock ${result.data.stock}`);
      setPendingDelta(0);
      setEditing(false);
      setStep("1");
    } else if (!result.success) {
      toast.error(result.error);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      save();
    }
    if (e.key === "Escape") discard();
  }

  if (editing) {
    return (
      <div className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 p-0.5">
        <button
          type="button"
          disabled={saving}
          onClick={() => bump(-1)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm font-bold text-red-400 transition-colors hover:bg-red-500/15 disabled:opacity-50"
          title="Quitar cantidad"
        >
          −
        </button>
        <input
          type="number"
          min="1"
          value={step}
          onChange={(e) => setStep(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
          className="w-12 rounded-md border border-white/10 bg-white/5 px-1 py-1 text-center text-sm font-semibold text-white outline-none focus:border-[#E0457B]/50"
        />
        <button
          type="button"
          disabled={saving}
          onClick={() => bump(1)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm font-bold text-green-400 transition-colors hover:bg-green-500/15 disabled:opacity-50"
          title="Agregar cantidad"
        >
          +
        </button>
        {dirty && (
          <span
            className={`px-1 text-xs font-bold tabular-nums ${pendingDelta > 0 ? "text-green-400" : "text-red-400"}`}
          >
            {pendingDelta > 0 ? `+${pendingDelta}` : pendingDelta}
          </span>
        )}
        {dirty && (
          <button
            type="button"
            disabled={saving}
            onClick={save}
            className="rounded-md bg-[#E0457B] px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#c93a6a] disabled:opacity-50"
            title="Guardar cambios"
          >
            {saving ? "…" : "Guardar"}
          </button>
        )}
        <button
          type="button"
          disabled={saving}
          onClick={discard}
          className="flex h-8 w-6 shrink-0 items-center justify-center text-xs text-white/40 hover:text-white disabled:opacity-50"
          title="Cancelar"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 p-0.5">
      <div className="inline-flex items-center">
        <button
          type="button"
          disabled={saving || displayStock === 0}
          onClick={() => bump(-1)}
          className="flex h-8 w-8 items-center justify-center rounded-md text-sm font-bold text-white/60 transition-colors hover:bg-red-500/15 hover:text-red-400 disabled:opacity-30"
          title="Quitar 1"
        >
          −
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => setEditing(true)}
          className={`min-w-[2.25rem] px-1.5 py-1 text-sm font-bold tabular-nums transition-colors hover:bg-white/5 ${
            dirty ? "text-[#E0457B]" : stockTextColor(displayStock)
          }`}
          title="Clic para ajustar cantidad"
        >
          {saving ? "…" : displayStock}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => bump(1)}
          className="flex h-8 w-8 items-center justify-center rounded-md text-sm font-bold text-white/60 transition-colors hover:bg-green-500/15 hover:text-green-400 disabled:opacity-50"
          title="Agregar 1"
        >
          +
        </button>
      </div>
      {dirty && (
        <>
          <button
            type="button"
            disabled={saving}
            onClick={save}
            className="rounded-md bg-[#E0457B] px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#c93a6a] disabled:opacity-50"
            title="Guardar cambios"
          >
            {saving ? "…" : "Guardar"}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={discard}
            className="flex h-8 w-6 shrink-0 items-center justify-center text-xs text-white/40 hover:text-white disabled:opacity-50"
            title="Descartar"
          >
            ✕
          </button>
        </>
      )}
    </div>
  );
}
