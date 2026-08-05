"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createShipment,
  deleteShipment,
  getAllShipments,
} from "@/app/actions/shipments";
import BarcodeScanner from "@/components/BarcodeScanner";
import ConfirmDialog from "@/components/ConfirmDialog";
import ShipmentCalendar, { type DayCounts } from "@/components/ShipmentCalendar";
import { PackageIcon, QrIcon, SearchIcon, TrashIcon } from "@/components/icons";
import type { Courier, Shipment } from "@/lib/types";
import { toast } from "sonner";

const COURIERS: Courier[] = ["Express", "FuneFlex"];

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function startOfWeek(d: Date): Date {
  const monday = new Date(d);
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  monday.setDate(d.getDate() - dow);
  return monday;
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}

function formatLongDate(key: string): string {
  return parseDateKey(key).toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export default function ShipmentsPage() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [courier, setCourier] = useState<Courier>("Express");
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Shipment | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const result = await getAllShipments();
      if (cancelled) return;

      if (!result.success) {
        toast.error(result.error);
        setLoading(false);
        return;
      }

      setShipments(result.data);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const countsByDate = useMemo(() => {
    const map: Record<string, DayCounts> = {};
    for (const s of shipments) {
      const entry = map[s.shipment_date] ?? { Express: 0, FuneFlex: 0 };
      entry[s.courier] += 1;
      map[s.shipment_date] = entry;
    }
    return map;
  }, [shipments]);

  const dayShipments = useMemo(
    () =>
      shipments
        .filter((s) => s.shipment_date === selectedDate)
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [shipments, selectedDate]
  );

  const weekStart = useMemo(
    () => startOfWeek(parseDateKey(selectedDate)),
    [selectedDate]
  );
  const weekEnd = useMemo(() => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 6);
    return d;
  }, [weekStart]);

  const weekTotals = useMemo(() => {
    const startKey = toDateKey(weekStart);
    const endKey = toDateKey(weekEnd);
    const totals: Record<Courier, number> = { Express: 0, FuneFlex: 0 };
    for (const s of shipments) {
      if (s.shipment_date >= startKey && s.shipment_date <= endKey) {
        totals[s.courier] += 1;
      }
    }
    return totals;
  }, [shipments, weekStart, weekEnd]);

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return shipments
      .filter((s) => s.envio_id.toLowerCase().includes(q))
      .slice(0, 30);
  }, [shipments, search]);

  function selectDate(key: string) {
    setSelectedDate(key);
    const d = parseDateKey(key);
    setVisibleMonth((prev) =>
      prev.getFullYear() === d.getFullYear() && prev.getMonth() === d.getMonth()
        ? prev
        : new Date(d.getFullYear(), d.getMonth(), 1)
    );
  }

  function changeMonth(delta: number) {
    setVisibleMonth(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1)
    );
  }

  async function handleScan(text: string) {
    const result = await createShipment(courier, text, selectedDate);
    if (result.success && result.data) {
      const shipment = result.data;
      setShipments((prev) => [shipment, ...prev]);
      toast.success(`${courier}: envío escaneado (#${shipment.envio_id})`);
    } else if (!result.success) {
      toast.error(result.error);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const result = await deleteShipment(deleteTarget.id);
    if (result.success) {
      setShipments((prev) => prev.filter((s) => s.id !== deleteTarget.id));
      toast.success("Escaneo eliminado");
    } else if (!result.success) {
      toast.error(result.error);
    }
    setDeleteTarget(null);
  }

  function toggleCamera() {
    setCameraError(null);
    setCameraActive((prev) => !prev);
  }

  return (
    <div className="page-container px-4 py-6">
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <PackageIcon />
          <h1 className="text-2xl font-semibold text-white">Envíos</h1>
        </div>
        <p className="mt-1 text-sm text-white/50">
          Escaneá el QR de cada etiqueta para registrar con qué cadetería y
          qué día se despachó cada paquete.
        </p>
      </div>

      {/* Search */}
      <div className="glass-card mb-6 p-4">
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
          <SearchIcon />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por N° de envío..."
            className="w-full bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="text-xs text-white/40 hover:text-white"
            >
              ✕
            </button>
          )}
        </div>

        {search.trim() && (
          <div className="mt-3 space-y-1.5">
            {searchResults.length === 0 ? (
              <p className="px-1 text-sm text-white/40">Sin resultados</p>
            ) : (
              searchResults.map((s) => (
                <div
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm"
                >
                  <span className="font-mono text-white/80">
                    #{s.envio_id}
                  </span>
                  <span className="flex items-center gap-2 text-xs text-white/50">
                    <CourierBadge courier={s.courier} />
                    {formatShortDate(parseDateKey(s.shipment_date))}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className="glass-card p-12 text-center text-white/50">
          Cargando envíos...
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <div className="space-y-6">
            <ShipmentCalendar
              visibleMonth={visibleMonth}
              selectedDate={selectedDate}
              countsByDate={countsByDate}
              onSelectDate={selectDate}
              onChangeMonth={changeMonth}
            />

            <div className="glass-card p-4 sm:p-5">
              <h3 className="text-sm font-semibold text-white/70">
                Total de la semana
              </h3>
              <p className="mt-0.5 text-xs text-white/40">
                {formatShortDate(weekStart)} al {formatShortDate(weekEnd)}
              </p>
              <div className="mt-4 space-y-3">
                {COURIERS.map((c) => (
                  <div key={c} className="flex items-center justify-between">
                    <CourierBadge courier={c} />
                    <span className="text-lg font-bold tabular-nums text-white">
                      {weekTotals[c]}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between border-t border-white/10 pt-3">
                  <span className="text-xs font-medium text-white/50">Total</span>
                  <span className="text-lg font-bold tabular-nums text-[#E0457B]">
                    {weekTotals.Express + weekTotals.FuneFlex}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="glass-card p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold capitalize text-white">
                    {formatLongDate(selectedDate)}
                  </h3>
                  <p className="mt-0.5 text-xs text-white/40">
                    {dayShipments.length} paquete
                    {dayShipments.length !== 1 ? "s" : ""} escaneado
                    {dayShipments.length !== 1 ? "s" : ""}
                  </p>
                </div>

                <div className="inline-flex self-start rounded-xl border border-white/10 p-1 sm:self-auto">
                  {COURIERS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCourier(c)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                        courier === c
                          ? "bg-[#E0457B] text-white"
                          : "text-white/60 hover:text-white"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={toggleCamera}
                className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-colors ${
                  cameraActive
                    ? "border border-white/15 text-white/70 hover:bg-white/5"
                    : "bg-[#E0457B] text-white hover:bg-[#c93a6a]"
                }`}
              >
                <QrIcon />
                {cameraActive
                  ? "Detener escaneo"
                  : `Escanear para ${courier}`}
              </button>

              {cameraError && (
                <p className="mt-2 text-center text-xs text-red-400">
                  {cameraError}
                </p>
              )}

              {cameraActive && (
                <div className="mt-4">
                  <BarcodeScanner
                    active={cameraActive}
                    continuous
                    onScan={handleScan}
                    onError={setCameraError}
                  />
                  <p className="mt-2 text-center text-xs text-white/40">
                    Apuntá al QR de cada etiqueta — se van a ir guardando
                    solas, una tras otra.
                  </p>
                </div>
              )}
            </div>

            <div className="glass-card overflow-hidden">
              <div className="border-b border-white/10 px-4 py-3">
                <h3 className="text-sm font-semibold text-white/70">
                  Paquetes de este día
                </h3>
              </div>

              {dayShipments.length === 0 ? (
                <div className="p-8 text-center text-sm text-white/40">
                  Todavía no se escaneó ningún paquete para este día.
                </div>
              ) : (
                <ul className="divide-y divide-white/5">
                  {dayShipments.map((s) => (
                    <li
                      key={s.id}
                      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-mono text-sm font-medium text-white/90">
                            #{s.envio_id}
                          </p>
                          {s.security_digit && (
                            <span className="shrink-0 rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white/50">
                              Díg. {s.security_digit}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-white/30">
                          {new Date(s.created_at).toLocaleTimeString("es-AR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <CourierBadge courier={s.courier} />
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(s)}
                          title="Eliminar escaneo"
                          aria-label="Eliminar escaneo"
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-white/30 transition-colors hover:bg-red-500/10 hover:text-red-400"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Eliminar escaneo"
        message={`¿Eliminar el envío #${deleteTarget?.envio_id} de ${deleteTarget?.courier}?`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function CourierBadge({ courier }: { courier: Courier }) {
  const isExpress = courier === "Express";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
        isExpress
          ? "bg-blue-500/10 text-blue-400"
          : "bg-orange-500/10 text-orange-400"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          isExpress ? "bg-blue-400" : "bg-orange-400"
        }`}
      />
      {courier}
    </span>
  );
}
