"use client";

import { useCallback, useMemo, useState } from "react";
import { formatPrice } from "@/lib/invoice-utils";
import type { InvoiceLineInput, ProcessInvoiceInput } from "@/lib/types";

type LineRow = InvoiceLineInput & { key: string };

type InvoiceReviewModalProps = {
  open: boolean;
  initialData: ProcessInvoiceInput;
  fileName?: string;
  saving: boolean;
  onClose: () => void;
  onConfirm: (data: ProcessInvoiceInput) => void;
};

function toRows(lines: InvoiceLineInput[]): LineRow[] {
  return lines.map((l) => ({ ...l, key: crypto.randomUUID() }));
}

export default function InvoiceReviewModal({
  open,
  initialData,
  fileName,
  saving,
  onClose,
  onConfirm,
}: InvoiceReviewModalProps) {
  const [invoiceNumber, setInvoiceNumber] = useState(initialData.invoice_number);
  const [invoiceType, setInvoiceType] = useState(initialData.invoice_type ?? "");
  const [invoiceDate, setInvoiceDate] = useState(initialData.invoice_date ?? "");
  const [supplier, setSupplier] = useState(initialData.supplier ?? "");
  const [supplierCuit, setSupplierCuit] = useState(initialData.supplier_cuit ?? "");
  const [cae, setCae] = useState(initialData.cae ?? "");
  const [caeExpiry, setCaeExpiry] = useState(initialData.cae_expiry ?? "");
  const [notes, setNotes] = useState(initialData.notes ?? "");
  const [lines, setLines] = useState<LineRow[]>(() => toRows(initialData.lines));

  const fiscalMeta = useMemo(
    () => ({
      subtotal: initialData.subtotal,
      iva_amount: initialData.iva_amount,
      total: initialData.total,
      total_units: initialData.total_units,
      item_count: initialData.item_count,
    }),
    [initialData]
  );

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

  function addLine() {
    setLines((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        name: "",
        sku: "",
        ean: "",
        marca: "",
        quantity: 1,
        unit_price: undefined,
      },
    ]);
  }

  function removeLine(key: string) {
    setLines((prev) =>
      prev.length === 1 ? prev : prev.filter((l) => l.key !== key)
    );
  }

  const lineTotal = useMemo(
    () =>
      lines.reduce(
        (sum, l) => sum + (l.unit_price ?? 0) * (l.quantity || 0),
        0
      ),
    [lines]
  );

  const sumUnits = useMemo(
    () => lines.reduce((sum, l) => sum + (l.quantity || 0), 0),
    [lines]
  );

  const validCount = lines.filter((l) => l.name.trim() && l.quantity > 0).length;

  const warnings = useMemo(() => {
    const w: string[] = [];
    if (fiscalMeta.item_count && validCount < fiscalMeta.item_count) {
      w.push(
        `Faltan ítems: se detectaron ${validCount} de ${fiscalMeta.item_count} que indica la factura`
      );
    }
    if (fiscalMeta.total_units && sumUnits !== fiscalMeta.total_units) {
      w.push(
        `Unidades: suma ${sumUnits}, la factura indica ${fiscalMeta.total_units}`
      );
    }
    return w;
  }, [fiscalMeta, validCount, sumUnits]);

  function handleConfirm() {
    const validLines = lines.filter((l) => l.name.trim() && l.quantity > 0);
    if (!invoiceNumber.trim() || validLines.length === 0) return;

    onConfirm({
      invoice_number: invoiceNumber.trim(),
      invoice_type: invoiceType.trim() || undefined,
      invoice_date: invoiceDate || undefined,
      supplier: supplier.trim() || undefined,
      supplier_cuit: supplierCuit.trim() || undefined,
      cae: cae.trim() || undefined,
      cae_expiry: caeExpiry || undefined,
      subtotal: fiscalMeta.subtotal,
      iva_amount: fiscalMeta.iva_amount,
      total: fiscalMeta.total ?? (lineTotal > 0 ? lineTotal : undefined),
      total_units: sumUnits,
      item_count: validLines.length,
      notes: notes.trim() || undefined,
      lines: validLines.map(({ name, sku, ean, marca, quantity, unit_price }) => ({
        name: name.trim(),
        sku: sku?.trim() || undefined,
        ean: ean?.trim() || undefined,
        marca: marca?.trim() || undefined,
        quantity,
        unit_price,
      })),
    });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-white/10 bg-[#1a1a1a]/98 shadow-2xl backdrop-blur-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-white">
              Verificar factura
              {invoiceType && (
                <span className="ml-2 text-sm font-normal text-white/50">
                  Tipo {invoiceType}
                </span>
              )}
            </h2>
            <p className="mt-0.5 text-xs text-white/50">
              Revisá los datos extraídos por IA antes de confirmar
              {fileName && ` · ${fileName}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg p-2 text-white/50 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {warnings.length > 0 && (
            <div className="mb-4 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-3">
              {warnings.map((w) => (
                <p key={w} className="text-xs text-yellow-200/90">
                  ⚠ {w}
                </p>
              ))}
            </div>
          )}

          <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Número de factura" required>
              <input
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Fecha">
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Proveedor">
              <input
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                className="input"
              />
            </Field>
            <Field label="CUIT proveedor">
              <input
                value={supplierCuit}
                onChange={(e) => setSupplierCuit(e.target.value)}
                className="input"
              />
            </Field>
            <Field label="CAE">
              <input
                value={cae}
                onChange={(e) => setCae(e.target.value)}
                className="input font-mono text-xs"
              />
            </Field>
            <Field label="Vencimiento CAE">
              <input
                type="date"
                value={caeExpiry}
                onChange={(e) => setCaeExpiry(e.target.value)}
                className="input"
              />
            </Field>
          </div>

          {(fiscalMeta.subtotal || fiscalMeta.total) && (
            <div className="mb-5 flex flex-wrap gap-4 rounded-xl border border-white/10 bg-white/2 px-4 py-3 text-xs text-white/60">
              {fiscalMeta.subtotal != null && (
                <span>Subtotal: {formatPrice(fiscalMeta.subtotal)}</span>
              )}
              {fiscalMeta.iva_amount != null && (
                <span>IVA: {formatPrice(fiscalMeta.iva_amount)}</span>
              )}
              {fiscalMeta.total != null && (
                <span className="font-medium text-white">
                  Total factura: {formatPrice(fiscalMeta.total)}
                </span>
              )}
              {fiscalMeta.total_units != null && (
                <span>Unidades: {fiscalMeta.total_units}</span>
              )}
            </div>
          )}

          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium text-white/70">
              Productos ({validCount}
              {fiscalMeta.item_count ? ` / ${fiscalMeta.item_count}` : ""})
            </h3>
            <button
              type="button"
              onClick={addLine}
              className="text-xs font-medium text-[#E0457B] hover:underline"
            >
              + Agregar línea
            </button>
          </div>

          <div className="space-y-2">
            {lines.map((line, idx) => (
              <div
                key={line.key}
                className="rounded-xl border border-white/10 bg-white/2 p-3"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs text-white/40">
                    #{idx + 1}
                    {line.sku && (
                      <span className="ml-2 font-mono text-white/50">
                        {line.sku}
                      </span>
                    )}
                  </span>
                  {lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLine(line.key)}
                      className="text-xs text-red-400/70 hover:text-red-400"
                    >
                      Quitar
                    </button>
                  )}
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Nombre" required>
                    <input
                      value={line.name}
                      onChange={(e) =>
                        updateLine(line.key, "name", e.target.value)
                      }
                      className="input"
                    />
                  </Field>
                  <Field label="SKU (código)">
                    <input
                      value={line.sku ?? ""}
                      onChange={(e) =>
                        updateLine(line.key, "sku", e.target.value)
                      }
                      className="input font-mono"
                    />
                  </Field>
                  <Field label="Marca">
                    <input
                      value={line.marca ?? ""}
                      onChange={(e) =>
                        updateLine(line.key, "marca", e.target.value)
                      }
                      className="input"
                    />
                  </Field>
                  <Field label="Cantidad" required>
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
                    />
                  </Field>
                  <Field label="P. unitario">
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
                    />
                  </Field>
                  <div className="flex items-end pb-2">
                    <span className="text-xs text-white/40">
                      Subtotal:{" "}
                      {formatPrice((line.unit_price ?? 0) * line.quantity)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <Field label="Observaciones" className="mt-4">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input min-h-[60px] resize-y"
            />
          </Field>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-white/10 px-6 py-4">
          <span className="text-xs text-white/40">
            {sumUnits} unidades · {validCount} ítems
          </span>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-white/70 transition-colors hover:bg-white/5 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={saving || !invoiceNumber.trim() || validCount === 0}
              className="rounded-lg bg-[#E0457B] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#c93a6a] disabled:opacity-50"
            >
              {saving ? "Guardando..." : "Confirmar y actualizar stock"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={className ?? "block"}>
      <span className="mb-1 block text-xs font-medium text-white/50">
        {label}
        {required && <span className="text-[#E0457B]"> *</span>}
      </span>
      {children}
    </label>
  );
}
