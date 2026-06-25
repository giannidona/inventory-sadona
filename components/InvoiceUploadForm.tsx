"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { parseInvoiceDocument } from "@/app/actions/parse-invoice";
import {
  processInvoice,
  uploadInvoiceFile,
} from "@/app/actions/invoices";
import InvoiceReviewModal from "@/components/InvoiceReviewModal";
import { parseCsvLines } from "@/lib/invoice-utils";
import type { InvoiceLineInput, ProcessInvoiceInput } from "@/lib/types";
import { toast } from "sonner";

type LineRow = InvoiceLineInput & { key: string };

function emptyLine(): LineRow {
  return {
    key: crypto.randomUUID(),
    name: "",
    sku: "",
    ean: "",
    marca: "",
    quantity: 1,
    unit_price: undefined,
  };
}

export default function InvoiceUploadForm() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showManual, setShowManual] = useState(false);

  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewData, setReviewData] = useState<ProcessInvoiceInput | null>(null);

  // Manual entry state (fallback)
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [supplier, setSupplier] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineRow[]>([emptyLine()]);
  const [showCsvHelp, setShowCsvHelp] = useState(false);

  const updateLine = useCallback(
    (key: string, field: keyof InvoiceLineInput, value: string | number | undefined) => {
      setLines((prev) =>
        prev.map((line) =>
          line.key === key ? { ...line, [field]: value } : line
        )
      );
    },
    []
  );

  async function handleAnalyze() {
    if (!file) {
      toast.error("Seleccioná un PDF o imagen de la factura");
      return;
    }

    setAnalyzing(true);
    const formData = new FormData();
    formData.append("file", file);

    const result = await parseInvoiceDocument(formData);
    setAnalyzing(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    setReviewData(result.data);
    setReviewOpen(true);

    const msg =
      result.data.item_count &&
      result.data.item_count !== result.data.lines.length
        ? `${result.data.lines.length} de ${result.data.item_count} ítems detectados — revisá el popup`
        : `${result.data.lines.length} productos detectados`;
    toast.success(msg);
  }

  async function handleConfirm(data: ProcessInvoiceInput) {
    setSaving(true);

    let fileInfo: { path: string; fileName: string } | undefined;
    if (file) {
      const formData = new FormData();
      formData.append("file", file);
      const uploadResult = await uploadInvoiceFile(formData);
      if (!uploadResult.success) {
        toast.error(uploadResult.error);
        setSaving(false);
        return;
      }
      fileInfo = uploadResult.data;
    }

    const result = await processInvoice(data, fileInfo);
    setSaving(false);

    if (result.success && result.data) {
      const { created, updated } = result.data;
      toast.success(
        `Factura guardada: ${created} creado${created !== 1 ? "s" : ""}, ${updated} actualizado${updated !== 1 ? "s" : ""}`
      );
      setReviewOpen(false);
      router.push("/invoices");
    } else if (!result.success) {
      toast.error(result.error);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    setFile(selected);
    setReviewData(null);
    setReviewOpen(false);
  }

  function handleCsvImport(e: React.ChangeEvent<HTMLInputElement>) {
    const csvFile = e.target.files?.[0];
    if (!csvFile) return;

    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCsvLines(reader.result as string);
      if (parsed.length === 0) {
        toast.error("No se pudieron leer productos del CSV");
        return;
      }
      setLines(
        parsed.map((row) => ({
          key: crypto.randomUUID(),
          name: row.name,
          sku: row.sku ?? "",
          ean: row.ean ?? "",
          marca: row.marca ?? "",
          quantity: row.quantity,
          unit_price: row.unit_price,
        }))
      );
      setShowManual(true);
      toast.success(`${parsed.length} productos importados`);
    };
    reader.readAsText(csvFile);
    e.target.value = "";
  }

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();

    const validLines = lines.filter((l) => l.name.trim() && l.quantity > 0);
    if (validLines.length === 0) {
      toast.error("Agregá al menos un producto con nombre y cantidad");
      return;
    }

    setReviewData({
      invoice_number: invoiceNumber,
      supplier: supplier || undefined,
      notes: notes || undefined,
      lines: validLines.map(({ name, sku, ean, marca, quantity, unit_price }) => ({
        name,
        sku: sku || undefined,
        ean: ean || undefined,
        marca: marca || undefined,
        quantity,
        unit_price,
      })),
    });
    setReviewOpen(true);
  }

  const isPdf = file?.type === "application/pdf";

  return (
    <>
      <div className="space-y-6">
        {/* PDF Upload - primary flow */}
        <div className="glass-card space-y-5 p-6">
          <div>
            <h2 className="text-lg font-semibold text-white">
              Subir factura (PDF)
            </h2>
            <p className="mt-1 text-sm text-white/50">
              Subí el PDF y Claude lo leerá automáticamente. Después podés
              verificar los datos antes de guardar.
            </p>
          </div>

          <div
            className={`relative rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
              file
                ? "border-[#E0457B]/50 bg-[#E0457B]/5"
                : "border-white/15 hover:border-white/25"
            }`}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*"
              onChange={handleFileChange}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
            {file ? (
              <div>
                <p className="font-medium text-white">{file.name}</p>
                <p className="mt-1 text-xs text-white/50">
                  {(file.size / 1024).toFixed(0)} KB ·{" "}
                  {isPdf ? "PDF" : "Imagen"}
                </p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                    if (fileRef.current) fileRef.current.value = "";
                  }}
                  className="mt-2 text-xs text-white/50 hover:text-white"
                >
                  Cambiar archivo
                </button>
              </div>
            ) : (
              <div>
                <p className="text-white/70">
                  Arrastrá o hacé clic para seleccionar
                </p>
                <p className="mt-1 text-xs text-white/40">
                  PDF, JPG, PNG o WebP (máx. 10 MB)
                </p>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleAnalyze}
            disabled={!file || analyzing}
            className="w-full rounded-xl bg-[#E0457B] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#c93a6a] disabled:opacity-50"
          >
            {analyzing ? (
              <span className="flex items-center justify-center gap-2">
                <Spinner />
                Claude está leyendo la factura...
              </span>
            ) : (
              "Analizar factura con IA"
            )}
          </button>
        </div>

        {/* Manual entry - collapsed */}
        <div className="glass-card overflow-hidden">
          <button
            type="button"
            onClick={() => setShowManual(!showManual)}
            className="flex w-full items-center justify-between px-6 py-4 text-left text-sm font-medium text-white/70 transition-colors hover:text-white"
          >
            <span>Carga manual (sin IA)</span>
            <span className="text-white/40">{showManual ? "▲" : "▼"}</span>
          </button>

          {showManual && (
            <form onSubmit={handleManualSubmit} className="space-y-5 border-t border-white/10 p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Número de factura" required>
                  <input
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    required
                    className="input"
                    placeholder="Ej: 0001-00012345"
                  />
                </Field>
                <Field label="Proveedor">
                  <input
                    value={supplier}
                    onChange={(e) => setSupplier(e.target.value)}
                    className="input"
                    placeholder="Ej: Distribuidora XYZ"
                  />
                </Field>
              </div>

              <Field label="Notas">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="input min-h-[60px] resize-y"
                />
              </Field>

              <div className="flex flex-wrap gap-2">
                <label className="cursor-pointer rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/5">
                  Importar CSV
                  <input
                    type="file"
                    accept=".csv,.txt"
                    onChange={handleCsvImport}
                    className="hidden"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setShowCsvHelp(!showCsvHelp)}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-white/50"
                >
                  Formato CSV
                </button>
                <button
                  type="button"
                  onClick={() => setLines((prev) => [...prev, emptyLine()])}
                  className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white"
                >
                  + Agregar línea
                </button>
              </div>

              {showCsvHelp && (
                <p className="text-xs text-white/40">
                  Columnas: nombre, sku, cantidad, precio, ean, marca
                </p>
              )}

              <div className="space-y-3">
                {lines.map((line, idx) => (
                  <div
                    key={line.key}
                    className="rounded-xl border border-white/10 bg-white/2 p-4"
                  >
                    <div className="mb-2 flex justify-between">
                      <span className="text-xs text-white/40">
                        Producto {idx + 1}
                      </span>
                      {lines.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setLines((prev) =>
                              prev.filter((l) => l.key !== line.key)
                            )
                          }
                          className="text-xs text-red-400/70"
                        >
                          Quitar
                        </button>
                      )}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <input
                        value={line.name}
                        onChange={(e) =>
                          updateLine(line.key, "name", e.target.value)
                        }
                        className="input"
                        placeholder="Nombre *"
                      />
                      <input
                        type="number"
                        min="1"
                        value={line.quantity}
                        onChange={(e) =>
                          updateLine(
                            line.key,
                            "quantity",
                            parseInt(e.target.value, 10) || 0
                          )
                        }
                        className="input"
                        placeholder="Cantidad *"
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.unit_price ?? ""}
                        onChange={(e) =>
                          updateLine(
                            line.key,
                            "unit_price",
                            e.target.value
                              ? parseFloat(e.target.value)
                              : undefined
                          )
                        }
                        className="input"
                        placeholder="Precio"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="submit"
                className="w-full rounded-xl border border-white/15 py-2.5 text-sm font-medium text-white/80 transition-colors hover:bg-white/5"
              >
                Revisar y confirmar
              </button>
            </form>
          )}
        </div>
      </div>

      {reviewData && (
        <InvoiceReviewModal
          key={reviewData.invoice_number + reviewData.lines.length}
          open={reviewOpen}
          initialData={reviewData}
          fileName={file?.name}
          saving={saving}
          onClose={() => !saving && setReviewOpen(false)}
          onConfirm={handleConfirm}
        />
      )}
    </>
  );
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-white/60">
        {label}
        {required && <span className="text-[#E0457B]"> *</span>}
      </span>
      {children}
    </label>
  );
}
