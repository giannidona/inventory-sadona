"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { createBrowserClient } from "@/lib/supabase/client";
import { loadLowStockThreshold, saveLowStockThreshold } from "@/lib/low-stock";

type LowStockItem = {
  id: string;
  name: string;
  sku: string;
  stock: number;
};

// Maps product id -> stock at the moment it was dismissed. An item
// reappears automatically once its stock changes again.
type DismissedMap = Record<string, number>;

const POLL_MS = 30000;
const MAX_VISIBLE = 8;
const DISMISSED_KEY = "sadona:dismissedLowStock";

function loadDismissed(): DismissedMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY);
    return raw ? (JSON.parse(raw) as DismissedMap) : {};
  } catch {
    return {};
  }
}

function saveDismissed(map: DismissedMap) {
  try {
    window.localStorage.setItem(DISMISSED_KEY, JSON.stringify(map));
  } catch {
    // ignore storage errors (private mode, quota, etc.)
  }
}

export default function LowStockBell() {
  const [open, setOpen] = useState(false);
  const [threshold, setThreshold] = useState<number>(() => loadLowStockThreshold());
  const [thresholdInput, setThresholdInput] = useState<string>(() =>
    String(loadLowStockThreshold())
  );
  const [items, setItems] = useState<LowStockItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [dismissed, setDismissed] = useState<DismissedMap>(() => loadDismissed());
  const wrapperRef = useRef<HTMLDivElement>(null);
  const seenLowIds = useRef<Set<string> | null>(null);
  const fetchRef = useRef<() => void>(() => {});
  const dismissedRef = useRef<DismissedMap>(dismissed);
  const thresholdRef = useRef<number>(threshold);

  useEffect(() => {
    dismissedRef.current = dismissed;
  }, [dismissed]);

  useEffect(() => {
    thresholdRef.current = threshold;
  }, [threshold]);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      const supabase = createBrowserClient();
      const currentThreshold = thresholdRef.current;

      const { data: lowItems, error } = await supabase
        .from("inventory")
        .select("id, name, sku, stock")
        .lte("stock", currentThreshold)
        .order("stock", { ascending: true })
        .order("name", { ascending: true });

      if (cancelled || error) return;

      const list = lowItems ?? [];
      setItems(list);

      // Un-dismiss items whose stock changed since they were cleared, and
      // drop dismissed entries for products that are no longer low stock.
      const currentDismissed = dismissedRef.current;
      const prunedDismissed: DismissedMap = {};
      for (const item of list) {
        if (currentDismissed[item.id] === item.stock) {
          prunedDismissed[item.id] = item.stock;
        }
      }
      if (
        Object.keys(prunedDismissed).length !==
        Object.keys(currentDismissed).length
      ) {
        dismissedRef.current = prunedDismissed;
        setDismissed(prunedDismissed);
        saveDismissed(prunedDismissed);
      }

      const currentIds = new Set(list.map((i) => i.id));
      if (seenLowIds.current) {
        const newlyLow = list.filter((i) => !seenLowIds.current!.has(i.id));
        if (newlyLow.length > 0) {
          toast.warning(
            newlyLow.length === 1
              ? `Stock bajo: ${newlyLow[0].name} (${newlyLow[0].stock})`
              : `${newlyLow.length} productos entraron en stock bajo`
          );
        }
      }
      seenLowIds.current = currentIds;
      setLoaded(true);
    }

    fetchRef.current = fetchData;
    fetchData();
    const interval = setInterval(fetchData, POLL_MS);

    function onFocus() {
      fetchData();
    }
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function saveThreshold() {
    const value = parseInt(thresholdInput, 10);
    if (!Number.isFinite(value) || value < 0) {
      toast.error("Ingresá un número válido");
      return;
    }
    setThreshold(value);
    saveLowStockThreshold(value);
    toast.success(`Alerta configurada en esta computadora: stock ≤ ${value}`);
    fetchRef.current();
  }

  const visibleItems = useMemo(
    () => items.filter((item) => dismissed[item.id] !== item.stock),
    [items, dismissed]
  );

  function dismissAll() {
    if (visibleItems.length === 0) return;
    const next: DismissedMap = { ...dismissed };
    for (const item of visibleItems) {
      next[item.id] = item.stock;
    }
    setDismissed(next);
    saveDismissed(next);
    toast.success("Notificaciones borradas");
  }

  const count = visibleItems.length;
  const thresholdChanged = thresholdInput !== String(threshold);

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/5 hover:text-white"
        title="Alertas de stock bajo"
      >
        <BellIcon />
        {loaded && count > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#E0457B] px-1 text-[10px] font-bold tabular-nums text-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-white/10 bg-[#1a1a1a]/95 shadow-2xl backdrop-blur-xl">
          <div className="border-b border-white/10 px-4 py-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Stock bajo</h3>
              <div className="flex items-center gap-3">
                {count > 0 && (
                  <button
                    type="button"
                    onClick={dismissAll}
                    className="text-xs font-medium text-white/50 transition-colors hover:text-white"
                  >
                    Borrar todas
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-white/40 transition-colors hover:text-white"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <label
                htmlFor="low-stock-threshold-input"
                className="text-xs text-white/50"
              >
                Avisar si el stock es ≤
              </label>
              <input
                id="low-stock-threshold-input"
                type="number"
                min="0"
                value={thresholdInput}
                onChange={(e) => setThresholdInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveThreshold()}
                className="w-16 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-center text-xs font-semibold text-white outline-none focus:border-[#E0457B]/50"
              />
              {thresholdChanged && (
                <button
                  type="button"
                  onClick={saveThreshold}
                  className="rounded-lg bg-[#E0457B] px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-[#c93a6a]"
                >
                  Guardar
                </button>
              )}
            </div>
            <p className="mt-1.5 text-[11px] text-white/30">
              Se guarda solo en esta computadora
            </p>
          </div>

          <div className="max-h-72 overflow-y-auto">
            {!loaded ? (
              <p className="px-4 py-6 text-center text-xs text-white/40">
                Cargando...
              </p>
            ) : count === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-white/40">
                {items.length > 0
                  ? "No hay notificaciones nuevas"
                  : "Todo el stock está por encima del umbral"}
              </p>
            ) : (
              visibleItems.slice(0, MAX_VISIBLE).map((item) => (
                <Link
                  key={item.id}
                  href="/"
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between gap-3 border-b border-white/5 px-4 py-2.5 text-sm transition-colors last:border-0 hover:bg-white/[0.03]"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-white">
                      {item.name}
                    </p>
                    <p className="font-mono text-xs text-white/40">
                      {item.sku}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 font-bold tabular-nums ${
                      item.stock === 0 ? "text-red-400" : "text-yellow-400"
                    }`}
                  >
                    {item.stock}
                  </span>
                </Link>
              ))
            )}
          </div>

          {items.length > 0 && (
            <div className="border-t border-white/10 p-2">
              <Link
                href="/?low=1"
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-2 text-center text-xs font-medium text-[#E0457B] transition-colors hover:bg-[#E0457B]/10"
              >
                Ver los {items.length} en el inventario
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BellIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}
