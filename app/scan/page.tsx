"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BrowserMultiFormatReader } from "@zxing/browser";

type ScannerControls = { stop: () => void };
import { updateStock } from "@/app/actions/inventory";
import StockBadge from "@/components/StockBadge";
import { createBrowserClient } from "@/lib/supabase/client";
import type { InventoryItem } from "@/lib/types";
import { toast } from "sonner";

type ScanState =
  | { phase: "scanning" }
  | { phase: "found"; product: InventoryItem; success?: boolean }
  | { phase: "not_found"; ean: string };

export default function ScanPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<ScannerControls | null>(null);
  const [scanState, setScanState] = useState<ScanState>({ phase: "scanning" });
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const scanningRef = useRef(true);

  const stopScanner = useCallback(() => {
    scanningRef.current = false;
    controlsRef.current?.stop();
    controlsRef.current = null;
  }, []);

  const lookupProduct = useCallback(async (ean: string) => {
    const supabase = createBrowserClient();
    const { data } = await supabase
      .from("inventory")
      .select("*")
      .eq("ean", ean)
      .maybeSingle();

    if (data) {
      setScanState({ phase: "found", product: data });
    } else {
      setScanState({ phase: "not_found", ean });
    }
  }, []);

  const startScanner = useCallback(async () => {
    stopScanner();
    scanningRef.current = true;
    setCameraError(null);
    setScanState({ phase: "scanning" });

    try {
      const reader = new BrowserMultiFormatReader();
      const devices = await BrowserMultiFormatReader.listVideoInputDevices();
      const backCamera =
        devices.find((d) => /back|rear|environment/i.test(d.label)) ??
        devices[0];

      if (!backCamera) {
        setCameraError("No se encontró cámara");
        return;
      }

      const controls = await reader.decodeFromVideoDevice(
        backCamera.deviceId,
        videoRef.current!,
        (result) => {
          if (!scanningRef.current || !result) return;
          scanningRef.current = false;
          controlsRef.current?.stop();
          lookupProduct(result.getText());
        }
      );

      controlsRef.current = controls;
    } catch {
      setCameraError("No se pudo acceder a la cámara");
    }
  }, [lookupProduct, stopScanner]);

  // Camera is an external system — mount on load, stop on unmount.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs with camera hardware
    void startScanner();
    return stopScanner;
  }, [startScanner, stopScanner]);

  async function handleAdjust(delta: number) {
    if (scanState.phase !== "found") return;
    setAdjusting(true);

    const result = await updateStock(
      scanState.product.id,
      delta,
      "scanner"
    );

    setAdjusting(false);

    if (result.success && result.data) {
      toast.success(`Stock actualizado: ${result.data.stock}`);
      setScanState({
        phase: "found",
        product: { ...scanState.product, stock: result.data.stock },
        success: true,
      });

      setTimeout(() => {
        startScanner();
      }, 1500);
    } else if (!result.success) {
      toast.error(result.error);
    }
  }

  function handleScanAgain() {
    startScanner();
  }

  return (
    <div className="flex min-h-[calc(100vh-57px)] flex-col bg-[#0f0f0f]">
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          playsInline
          muted
        />

        {scanState.phase === "scanning" && !cameraError && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative h-48 w-72 rounded-2xl border-2 border-[#E0457B]/60 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]">
              <div className="absolute -top-0.5 -left-0.5 h-6 w-6 border-t-2 border-l-2 border-[#E0457B]" />
              <div className="absolute -top-0.5 -right-0.5 h-6 w-6 border-t-2 border-r-2 border-[#E0457B]" />
              <div className="absolute -bottom-0.5 -left-0.5 h-6 w-6 border-b-2 border-l-2 border-[#E0457B]" />
              <div className="absolute -right-0.5 -bottom-0.5 h-6 w-6 border-r-2 border-b-2 border-[#E0457B]" />
              <div className="absolute inset-x-4 top-1/2 h-0.5 animate-pulse bg-[#E0457B]/80" />
            </div>
          </div>
        )}

        {cameraError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6">
            <p className="text-center text-white/70">{cameraError}</p>
          </div>
        )}
      </div>

      <div className="border-t border-white/10 bg-[#1a1a1a]/95 p-4 backdrop-blur-xl">
        {scanState.phase === "scanning" && (
          <p className="text-center text-sm text-white/50">
            Apuntá la cámara al código de barras
          </p>
        )}

        {scanState.phase === "found" && (
          <div className="space-y-4">
            {scanState.success && (
              <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-2 text-center text-sm font-medium text-green-400">
                ✓ Stock actualizado — listo para el siguiente
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  {scanState.product.name}
                </h2>
                <p className="font-mono text-xs text-white/50">
                  {scanState.product.sku}
                </p>
              </div>
              <StockBadge stock={scanState.product.stock} />
            </div>

            {!scanState.success && (
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={adjusting}
                  onClick={() => handleAdjust(-1)}
                  className="rounded-xl bg-red-500/90 py-4 text-lg font-bold text-white transition-colors hover:bg-red-500 disabled:opacity-50"
                >
                  − Descontar 1
                </button>
                <button
                  type="button"
                  disabled={adjusting}
                  onClick={() => handleAdjust(1)}
                  className="rounded-xl bg-green-500/90 py-4 text-lg font-bold text-white transition-colors hover:bg-green-500 disabled:opacity-50"
                >
                  + Agregar 1
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={handleScanAgain}
              className="w-full rounded-xl border border-white/10 py-2.5 text-sm font-medium text-white/60 transition-colors hover:bg-white/5"
            >
              Escanear otro
            </button>
          </div>
        )}

        {scanState.phase === "not_found" && (
          <div className="space-y-4 text-center">
            <div>
              <p className="text-lg font-semibold text-white">
                Producto no encontrado
              </p>
              <p className="mt-1 font-mono text-sm text-white/50">
                EAN: {scanState.ean}
              </p>
            </div>
            <Link
              href={`/add?ean=${encodeURIComponent(scanState.ean)}`}
              className="block w-full rounded-xl bg-[#E0457B] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#c93a6a]"
            >
              Crear producto con este EAN
            </Link>
            <button
              type="button"
              onClick={handleScanAgain}
              className="w-full rounded-xl border border-white/10 py-2.5 text-sm font-medium text-white/60 transition-colors hover:bg-white/5"
            >
              Escanear otro
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
