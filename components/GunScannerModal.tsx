"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { undoMovement, updateStock } from "@/app/actions/inventory";
import type { InventoryItem } from "@/lib/types";

type Mode = "subtract" | "add";

type Pending = {
  count: number;
  sign: 1 | -1;
  name: string;
  timer: ReturnType<typeof setTimeout> | undefined;
};

type PendingView = { id: string; name: string; delta: number };

type LogEntry =
  | { id: number; at: Date; kind: "ok"; name: string; delta: number; stock: number; movementId?: string; inventoryId: string }
  | { id: number; at: Date; kind: "error"; name: string; message: string }
  | { id: number; at: Date; kind: "notfound"; code: string };

// Distributive Omit: conserva cada variante por separado.
type LogInput = LogEntry extends infer E ? (E extends LogEntry ? Omit<E, "id" | "at"> : never) : never;

/** Tiempo sin nuevos escaneos del mismo producto para cerrar el movimiento. */
const FLUSH_MS = 1200;

/** Compara códigos sin importar ceros iniciales, espacios ni mayúsculas. */
function codeKey(value: string): string {
  return value.replace(/\s/g, "").toUpperCase().replace(/^0+/, "");
}

let audioCtx: AudioContext | null = null;
function beep(ok: boolean) {
  try {
    audioCtx ??= new AudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = ok ? 880 : 220;
    gain.gain.value = 0.08;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + (ok ? 0.07 : 0.25));
  } catch {
    // sin audio disponible: no pasa nada
  }
}

const pad = (n: number) => String(n).padStart(2, "0");
const formatTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

type Props = {
  items: InventoryItem[];
  onClose: () => void;
  /** Avisa el stock real que quedó, para actualizar la tabla de atrás. */
  onStockChanged: (id: string, stock: number) => void;
};

export default function GunScannerModal({ items, onClose, onStockChanged }: Props) {
  const [mode, setMode] = useState<Mode>("subtract");
  const modeRef = useRef<Mode>("subtract");
  const [value, setValue] = useState("");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [pendingView, setPendingView] = useState<PendingView[]>([]);
  const [undoing, setUndoing] = useState<Set<number>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  const pendingRef = useRef(new Map<string, Pending>());
  // Stock "proyectado": el real + lo que ya se escaneó y todavía no se guardó.
  const projectedRef = useRef(new Map<string, number>());
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const logIdRef = useRef(0);
  const itemsRef = useRef(items);
  const onStockChangedRef = useRef(onStockChanged);

  useEffect(() => {
    itemsRef.current = items;
    onStockChangedRef.current = onStockChanged;
  }, [items, onStockChanged]);

  const index = useMemo(() => {
    const map = new Map<string, InventoryItem>();
    for (const item of items) {
      for (const code of [item.ean, item.sku]) {
        const key = code ? codeKey(code) : "";
        if (key && !map.has(key)) map.set(key, item);
      }
    }
    return map;
  }, [items]);

  function addLog(entry: LogInput) {
    const full = { ...entry, id: ++logIdRef.current, at: new Date() } as LogEntry;
    setLog((prev) => [full, ...prev].slice(0, 200));
  }

  function syncView() {
    setPendingView(
      [...pendingRef.current.entries()].map(([id, p]) => ({
        id,
        name: p.name,
        delta: p.sign * p.count,
      }))
    );
  }

  function pendingSigned(id: string) {
    const p = pendingRef.current.get(id);
    return p ? p.sign * p.count : 0;
  }

  /** Cierra el movimiento de un producto: UNA sola operación por todos los escaneos juntados. */
  function flush(id: string) {
    const p = pendingRef.current.get(id);
    if (!p) return;
    clearTimeout(p.timer);
    pendingRef.current.delete(id);
    syncView();

    const delta = p.sign * p.count;
    // Se encadena: las operaciones se aplican de a una, en orden.
    queueRef.current = queueRef.current.then(async () => {
      const result = await updateStock(id, delta, "pistola scanner");
      if (result.success && result.data) {
        projectedRef.current.set(id, result.data.stock + pendingSigned(id));
        onStockChangedRef.current(id, result.data.stock);
        addLog({
          kind: "ok",
          name: p.name,
          delta,
          stock: result.data.stock,
          movementId: result.data.movementId,
          inventoryId: id,
        });
      } else {
        // No se guardó: descartar lo proyectado y volver al stock real conocido.
        const real = itemsRef.current.find((i) => i.id === id)?.stock ?? 0;
        projectedRef.current.set(id, real + pendingSigned(id));
        addLog({
          kind: "error",
          name: p.name,
          message: result.success ? "Error desconocido" : result.error,
        });
        beep(false);
      }
    });
  }

  function flushAll(): Promise<void> {
    for (const id of [...pendingRef.current.keys()]) flush(id);
    return queueRef.current;
  }

  function scan(raw: string) {
    const key = codeKey(raw);
    if (!key) return;

    const item = index.get(key);
    if (!item) {
      addLog({ kind: "notfound", code: raw.trim() });
      beep(false);
      return;
    }

    const sign: 1 | -1 = modeRef.current === "add" ? 1 : -1;
    const projected = projectedRef.current.get(item.id) ?? item.stock;
    if (sign < 0 && projected <= 0) {
      addLog({ kind: "error", name: item.name, message: "No hay stock para restar" });
      beep(false);
      return;
    }
    projectedRef.current.set(item.id, projected + sign);

    let p = pendingRef.current.get(item.id);
    if (!p) {
      p = { count: 0, sign, name: item.name, timer: undefined };
      pendingRef.current.set(item.id, p);
    }
    p.count += 1;
    clearTimeout(p.timer);
    p.timer = setTimeout(() => flush(item.id), FLUSH_MS);
    syncView();
    beep(true);
  }

  /** Saca un escaneo pendiente (todavía no guardado) sin tocar la base. */
  function cancelPending(id: string) {
    const p = pendingRef.current.get(id);
    if (!p) return;
    clearTimeout(p.timer);
    pendingRef.current.delete(id);
    const real = itemsRef.current.find((i) => i.id === id)?.stock ?? 0;
    projectedRef.current.set(id, real);
    syncView();
  }

  /** Deshace un movimiento ya guardado: devuelve el stock y borra el registro. */
  async function undoEntry(entry: Extract<LogEntry, { kind: "ok" }>) {
    if (!entry.movementId || undoing.has(entry.id)) return;
    setUndoing((prev) => new Set(prev).add(entry.id));
    const result = await undoMovement(entry.movementId);
    setUndoing((prev) => {
      const next = new Set(prev);
      next.delete(entry.id);
      return next;
    });
    if (result.success && result.data) {
      projectedRef.current.set(
        result.data.inventoryId,
        result.data.stock + pendingSigned(result.data.inventoryId)
      );
      onStockChangedRef.current(result.data.inventoryId, result.data.stock);
      setLog((prev) => prev.filter((e) => e.id !== entry.id));
    } else if (!result.success) {
      addLog({ kind: "error", name: entry.name, message: result.error });
      beep(false);
    }
    inputRef.current?.focus();
  }

  async function changeMode(next: Mode) {
    if (next === modeRef.current) return;
    await flushAll(); // lo pendiente se cierra con el modo anterior
    modeRef.current = next;
    setMode(next);
    inputRef.current?.focus();
  }

  async function handleClose() {
    await flushAll();
    onClose();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const raw = value;
    setValue("");
    if (raw.trim()) scan(raw);
    else void flushAll(); // Enter con el campo vacío = aplicar ahora
  }

  useEffect(() => {
    inputRef.current?.focus();
    const pending = pendingRef.current;
    return () => {
      // si se cierra de golpe, no se pierde nada de lo escaneado
      for (const id of [...pending.keys()]) flush(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isSub = mode === "subtract";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm"
      onClick={() => inputRef.current?.focus()}
    >
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#1a1a1a]/95 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Pistola scanner</h2>
            <p className="text-xs text-white/50">
              Escaneá varias veces el mismo producto y se guarda como un solo movimiento.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleClose()}
            className="rounded-lg p-2 text-white/50 transition-colors hover:bg-white/5 hover:text-white"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {/* Izquierda: modo + input + pendientes */}
          <div className="space-y-4 border-b border-white/10 p-5 md:border-b-0 md:border-r">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void changeMode("subtract")}
                className={`rounded-xl py-3 text-sm font-bold transition-colors ${
                  isSub
                    ? "bg-red-500 text-white"
                    : "bg-white/5 text-white/50 hover:bg-white/10"
                }`}
              >
                − Restar
              </button>
              <button
                type="button"
                onClick={() => void changeMode("add")}
                className={`rounded-xl py-3 text-sm font-bold transition-colors ${
                  !isSub
                    ? "bg-green-500 text-white"
                    : "bg-white/5 text-white/50 hover:bg-white/10"
                }`}
              >
                + Sumar
              </button>
            </div>

            <input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={() => setTimeout(() => inputRef.current?.focus(), 0)}
              inputMode="none"
              autoComplete="off"
              autoFocus
              placeholder="Escaneá un código…"
              className={`input w-full text-center font-mono text-lg ${
                isSub ? "border-red-500/40" : "border-green-500/40"
              }`}
            />
            <p className="text-center text-xs text-white/40">
              Se aplica {FLUSH_MS / 1000} s después del último escaneo. Enter con el campo vacío lo aplica ya.
            </p>

            <div className="space-y-2">
              {pendingView.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-white/30">
                  Esperando escaneo…
                </div>
              ) : (
                pendingView.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3"
                  >
                    <span className="min-w-0 truncate text-sm font-medium text-white">
                      {p.name}
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span
                        className={`text-2xl font-bold tabular-nums ${
                          p.delta < 0 ? "text-red-400" : "text-green-400"
                        }`}
                      >
                        {signed(p.delta)}
                      </span>
                      <button
                        type="button"
                        onClick={() => cancelPending(p.id)}
                        title="Cancelar este escaneo"
                        className="rounded-md p-1 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
                      >
                        ✕
                      </button>
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Derecha: historial de la sesión */}
          <div className="flex min-h-0 flex-col p-5">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/40">
              Historial de esta sesión
            </h3>
            <div className="min-h-[12rem] flex-1 space-y-1.5 overflow-y-auto pr-1">
              {log.length === 0 && (
                <p className="py-8 text-center text-sm text-white/30">Todavía no hay movimientos</p>
              )}
              {log.map((e) =>
                e.kind === "ok" ? (
                  <div key={e.id} className="flex items-center gap-3 rounded-lg bg-white/[0.04] px-3 py-2">
                    <span className="font-mono text-[11px] text-white/40">{formatTime(e.at)}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-white/80">{e.name}</span>
                    <span
                      className={`text-sm font-bold tabular-nums ${
                        e.delta < 0 ? "text-red-400" : "text-green-400"
                      }`}
                    >
                      {signed(e.delta)}
                    </span>
                    <span className="w-16 text-right text-xs tabular-nums text-white/40">
                      stock {e.stock}
                    </span>
                    {e.movementId && (
                      <button
                        type="button"
                        disabled={undoing.has(e.id)}
                        onClick={() => void undoEntry(e)}
                        title="Deshacer este movimiento (devuelve el stock y lo borra del historial)"
                        className="rounded-md p-1 text-white/40 transition-colors hover:bg-red-500/20 hover:text-red-300 disabled:opacity-40"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ) : e.kind === "error" ? (
                  <div key={e.id} className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                    <span className="mr-2 font-mono text-[11px] text-red-300/60">{formatTime(e.at)}</span>
                    {e.name}: {e.message}
                  </div>
                ) : (
                  <div
                    key={e.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-yellow-400/30 bg-yellow-400/10 px-3 py-2 text-sm text-yellow-300"
                  >
                    <span>
                      <span className="mr-2 font-mono text-[11px] text-yellow-300/60">{formatTime(e.at)}</span>
                      Código no encontrado: <span className="font-mono">{e.code}</span>
                    </span>
                    <Link
                      href={`/add?ean=${encodeURIComponent(e.code)}`}
                      className="shrink-0 text-xs font-semibold underline"
                    >
                      Crear
                    </Link>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
