"use client";

import { useCallback, useEffect, useRef } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

type ScannerControls = { stop: () => void };

type BarcodeScannerProps = {
  active: boolean;
  onScan: (ean: string) => void;
  onError?: (message: string) => void;
  /**
   * Keeps the camera running and re-arms scanning after every hit instead of
   * stopping at the first one — for batch workflows like scanning a stack of
   * shipping labels one after another. Repeats of the same code within a
   * short window are ignored so holding a label in frame doesn't fire twice.
   */
  continuous?: boolean;
};

const REPEAT_GUARD_MS = 2500;

export default function BarcodeScanner({
  active,
  onScan,
  onError,
  continuous = false,
}: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<ScannerControls | null>(null);
  const scanningRef = useRef(false);
  const onScanRef = useRef(onScan);
  const onErrorRef = useRef(onError);
  const continuousRef = useRef(continuous);
  const lastResultRef = useRef<{ text: string; at: number } | null>(null);

  useEffect(() => {
    onScanRef.current = onScan;
    onErrorRef.current = onError;
    continuousRef.current = continuous;
  }, [onScan, onError, continuous]);

  const stopScanner = useCallback(() => {
    scanningRef.current = false;
    controlsRef.current?.stop();
    controlsRef.current = null;
  }, []);

  const startScanner = useCallback(async () => {
    stopScanner();
    scanningRef.current = true;
    lastResultRef.current = null;

    try {
      const reader = new BrowserMultiFormatReader();
      const devices = await BrowserMultiFormatReader.listVideoInputDevices();
      const backCamera =
        devices.find((d) => /back|rear|environment/i.test(d.label)) ??
        devices[0];

      if (!backCamera) {
        onErrorRef.current?.("No se encontró cámara");
        return;
      }

      const controls = await reader.decodeFromVideoDevice(
        backCamera.deviceId,
        videoRef.current!,
        (result) => {
          if (!scanningRef.current || !result) return;
          const text = result.getText();

          if (continuousRef.current) {
            const now = Date.now();
            const last = lastResultRef.current;
            if (last && last.text === text && now - last.at < REPEAT_GUARD_MS) {
              return;
            }
            lastResultRef.current = { text, at: now };
            onScanRef.current(text);
            return;
          }

          scanningRef.current = false;
          controlsRef.current?.stop();
          onScanRef.current(text);
        }
      );

      controlsRef.current = controls;
    } catch {
      onErrorRef.current?.("No se pudo acceder a la cámara");
    }
  }, [stopScanner]);

  useEffect(() => {
    if (active) {
      void startScanner();
    } else {
      stopScanner();
    }
    return stopScanner;
  }, [active, startScanner, stopScanner]);

  if (!active) return null;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black aspect-[4/3] sm:aspect-video">
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover"
        playsInline
        muted
      />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="relative h-32 w-56 rounded-xl border-2 border-[#E0457B]/60 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] sm:h-40 sm:w-72">
          <div className="absolute -top-0.5 -left-0.5 h-5 w-5 border-t-2 border-l-2 border-[#E0457B]" />
          <div className="absolute -top-0.5 -right-0.5 h-5 w-5 border-t-2 border-r-2 border-[#E0457B]" />
          <div className="absolute -bottom-0.5 -left-0.5 h-5 w-5 border-b-2 border-l-2 border-[#E0457B]" />
          <div className="absolute -right-0.5 -bottom-0.5 h-5 w-5 border-r-2 border-b-2 border-[#E0457B]" />
          <div className="absolute inset-x-4 top-1/2 h-0.5 animate-pulse bg-[#E0457B]/80" />
        </div>
      </div>
    </div>
  );
}
