"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getInvoiceFileUrl } from "@/app/actions/invoices";
import { createBrowserClient } from "@/lib/supabase/client";
import { formatPrice } from "@/lib/invoice-utils";
import type { Invoice } from "@/lib/types";
import { toast } from "sonner";

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const supabase = createBrowserClient();
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .order("created_at", { ascending: false });

      if (cancelled) return;

      if (error) {
        toast.error("Error al cargar facturas");
        setLoading(false);
        return;
      }
      setInvoices(data ?? []);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleDownload(invoice: Invoice) {
    if (!invoice.file_path) {
      toast.error("Esta factura no tiene archivo adjunto");
      return;
    }
    const result = await getInvoiceFileUrl(invoice.file_path);
    if (result.success && result.data) {
      window.open(result.data.url, "_blank");
    } else {
      toast.error(result.success ? "Error" : result.error);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Facturas</h1>
          <p className="mt-1 text-sm text-white/50">
            Historial de facturas procesadas
          </p>
        </div>
        <Link
          href="/invoices/upload"
          className="rounded-xl bg-[#E0457B] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#c93a6a]"
        >
          + Subir factura
        </Link>
      </div>

      {loading ? (
        <div className="glass-card p-12 text-center text-white/50">
          Cargando facturas...
        </div>
      ) : invoices.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <p className="text-white/50">No hay facturas registradas</p>
          <Link
            href="/invoices/upload"
            className="mt-4 inline-block text-sm font-medium text-[#E0457B] hover:underline"
          >
            Subir la primera factura
          </Link>
        </div>
      ) : (
        <>
          <div className="glass-card hidden overflow-hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-white/50">
                  <th className="px-4 py-3 font-medium">Número</th>
                  <th className="px-4 py-3 font-medium">Proveedor</th>
                  <th className="px-4 py-3 font-medium">Total</th>
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Archivo</th>
                  <th className="px-4 py-3 font-medium">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className="border-b border-white/5 transition-colors hover:bg-white/[0.02]"
                  >
                    <td className="px-4 py-3 font-medium text-white">
                      {inv.invoice_number}
                    </td>
                    <td className="px-4 py-3 text-white/60">
                      {inv.supplier ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-white/70">
                      {formatPrice(inv.total)}
                    </td>
                    <td className="px-4 py-3 text-white/50">
                      {new Date(inv.created_at).toLocaleDateString("es-AR")}
                    </td>
                    <td className="px-4 py-3">
                      {inv.file_name ? (
                        <button
                          type="button"
                          onClick={() => handleDownload(inv)}
                          className="text-xs font-medium text-[#E0457B] hover:underline"
                        >
                          {inv.file_name}
                        </button>
                      ) : (
                        <span className="text-white/30">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/invoices/${inv.id}`}
                        className="text-xs font-medium text-white/60 hover:text-white"
                      >
                        Ver detalle
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 md:hidden">
            {invoices.map((inv) => (
              <div key={inv.id} className="glass-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-white">
                      {inv.invoice_number}
                    </h3>
                    <p className="mt-0.5 text-xs text-white/50">
                      {inv.supplier ?? "Sin proveedor"} ·{" "}
                      {new Date(inv.created_at).toLocaleDateString("es-AR")}
                    </p>
                  </div>
                  <span className="text-sm font-medium text-white/70">
                    {formatPrice(inv.total)}
                  </span>
                </div>
                <div className="mt-3 flex gap-3">
                  {inv.file_name && (
                    <button
                      type="button"
                      onClick={() => handleDownload(inv)}
                      className="text-xs font-medium text-[#E0457B]"
                    >
                      Ver archivo
                    </button>
                  )}
                  <Link
                    href={`/invoices/${inv.id}`}
                    className="text-xs font-medium text-white/60"
                  >
                    Ver detalle
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
