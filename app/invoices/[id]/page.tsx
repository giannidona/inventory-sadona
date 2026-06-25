"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getInvoiceWithItems } from "@/app/actions/invoices";
import { formatPrice } from "@/lib/invoice-utils";
import type { Invoice, InvoiceItem } from "@/lib/types";
import { toast } from "sonner";

export default function InvoiceDetailPage() {
  const params = useParams();
  const invoiceId = params.id as string;

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const result = await getInvoiceWithItems(invoiceId);
      if (cancelled) return;

      if (!result.success || !result.data) {
        toast.error(result.success ? "Error" : result.error);
        setLoading(false);
        return;
      }

      setInvoice(result.data.invoice);
      setItems(result.data.items);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [invoiceId]);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 text-center text-white/50">
        Cargando factura...
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 text-center">
        <p className="text-white/50">Factura no encontrada</p>
        <Link
          href="/invoices"
          className="mt-4 inline-block text-sm text-[#E0457B] hover:underline"
        >
          Volver a facturas
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <Link
        href="/invoices"
        className="mb-4 inline-block text-sm text-white/50 hover:text-white"
      >
        ← Volver a facturas
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">
          Factura {invoice.invoice_number}
        </h1>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/50">
          {invoice.supplier && <span>Proveedor: {invoice.supplier}</span>}
          {invoice.supplier_cuit && <span>CUIT: {invoice.supplier_cuit}</span>}
          {invoice.invoice_type && <span>Tipo: {invoice.invoice_type}</span>}
          <span>
            Fecha:{" "}
            {invoice.invoice_date
              ? new Date(invoice.invoice_date + "T12:00:00").toLocaleDateString("es-AR")
              : new Date(invoice.created_at).toLocaleDateString("es-AR")}
          </span>
          {invoice.cae && <span className="font-mono text-xs">CAE: {invoice.cae}</span>}
          <span>Total: {formatPrice(invoice.total)}</span>
        </div>
        {(invoice.subtotal || invoice.iva_amount) && (
          <div className="mt-1 flex flex-wrap gap-4 text-xs text-white/40">
            {invoice.subtotal != null && (
              <span>Subtotal: {formatPrice(invoice.subtotal)}</span>
            )}
            {invoice.iva_amount != null && (
              <span>IVA: {formatPrice(invoice.iva_amount)}</span>
            )}
            {invoice.total_units != null && (
              <span>{invoice.total_units} unidades</span>
            )}
            {invoice.item_count != null && (
              <span>{invoice.item_count} ítems</span>
            )}
          </div>
        )}
        {invoice.notes && (
          <p className="mt-2 text-sm text-white/40">{invoice.notes}</p>
        )}
      </div>

      <div className="glass-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-white/50">
              <th className="px-4 py-3 font-medium">Producto</th>
              <th className="px-4 py-3 font-medium">SKU</th>
              <th className="px-4 py-3 font-medium">Cantidad</th>
              <th className="px-4 py-3 font-medium">Precio unit.</th>
              <th className="px-4 py-3 font-medium">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.id}
                className="border-b border-white/5"
              >
                <td className="px-4 py-3 text-white">{item.product_name}</td>
                <td className="px-4 py-3 font-mono text-white/50">
                  {item.sku ?? "—"}
                </td>
                <td className="px-4 py-3 text-white/70">{item.quantity}</td>
                <td className="px-4 py-3 text-white/70">
                  {formatPrice(item.unit_price)}
                </td>
                <td className="px-4 py-3 text-white/70">
                  {formatPrice((item.unit_price ?? 0) * item.quantity)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
