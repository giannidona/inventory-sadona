import InvoiceUploadForm from "@/components/InvoiceUploadForm";

export default function UploadInvoicePage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="mb-2 text-2xl font-semibold text-white">Subir factura</h1>
      <p className="mb-6 text-sm text-white/50">
        Subí el PDF de la factura, Claude la leerá automáticamente y podrás
        verificar los datos antes de actualizar el stock.
      </p>
      <InvoiceUploadForm />
    </div>
  );
}
