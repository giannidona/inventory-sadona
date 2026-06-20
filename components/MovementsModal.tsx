"use client";

import { useEffect, useState } from "react";
import { getMovements } from "@/app/actions/inventory";
import type { InventoryItem, StockMovement } from "@/lib/types";

type MovementsModalProps = {
  product: InventoryItem | null;
  onClose: () => void;
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MovementsModal({ product, onClose }: MovementsModalProps) {
  if (!product) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#1a1a1a]/95 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">Historial de movimientos</h2>
            <p className="text-sm text-white/50">{product.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-white/50 transition-colors hover:bg-white/5 hover:text-white"
          >
            ✕
          </button>
        </div>

        <MovementsList key={product.id} productId={product.id} />
      </div>
    </div>
  );
}

function MovementsList({ productId }: { productId: string }) {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    getMovements(productId).then((result) => {
      if (cancelled) return;
      if (result.success) setMovements(result.data);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [productId]);

  if (loading) {
    return <p className="py-8 text-center text-sm text-white/50">Cargando...</p>;
  }

  if (movements.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-white/50">
        Sin movimientos registrados
      </p>
    );
  }

  return (
    <div className="max-h-[60vh] overflow-y-auto p-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10 text-left text-white/50">
            <th className="pb-2 pr-4 font-medium">Fecha</th>
            <th className="pb-2 pr-4 font-medium">Delta</th>
            <th className="pb-2 font-medium">Razón</th>
          </tr>
        </thead>
        <tbody>
          {movements.map((m) => (
            <tr key={m.id} className="border-b border-white/5">
              <td className="py-2.5 pr-4 text-white/70">
                {formatDate(m.created_at)}
              </td>
              <td
                className={`py-2.5 pr-4 font-semibold tabular-nums ${
                  m.delta > 0 ? "text-green-400" : "text-red-400"
                }`}
              >
                {m.delta > 0 ? `+${m.delta}` : m.delta}
              </td>
              <td className="py-2.5 text-white/60">{m.reason ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
