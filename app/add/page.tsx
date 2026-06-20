"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { addProduct } from "@/app/actions/inventory";
import { createBrowserClient } from "@/lib/supabase/client";
import { toast } from "sonner";

function AddProductForm({ prefillEan }: { prefillEan: string }) {
  const router = useRouter();

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [ean, setEan] = useState(prefillEan);
  const [stock, setStock] = useState("0");
  const [marca, setMarca] = useState("");
  const [saving, setSaving] = useState(false);
  const [skuStatus, setSkuStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");

  const checkSku = useCallback(async (value: string) => {
    if (!value.trim()) {
      setSkuStatus("idle");
      return;
    }
    setSkuStatus("checking");
    const supabase = createBrowserClient();
    const { data } = await supabase
      .from("inventory")
      .select("id")
      .eq("sku", value.trim())
      .maybeSingle();

    setSkuStatus(data ? "taken" : "available");
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => checkSku(sku), 400);
    return () => clearTimeout(timer);
  }, [sku, checkSku]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (skuStatus === "taken") {
      toast.error("El SKU ya existe");
      return;
    }

    setSaving(true);
    const result = await addProduct({
      name,
      sku: sku.trim(),
      ean: ean.trim() || undefined,
      stock: parseInt(stock, 10) || 0,
      marca: marca.trim() || undefined,
    });
    setSaving(false);

    if (result.success) {
      toast.success("Producto agregado");
      router.push("/");
    } else {
      toast.error(result.error);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <h1 className="mb-6 text-2xl font-semibold text-white">Agregar producto</h1>

      <form onSubmit={handleSubmit} className="glass-card space-y-5 p-6">
        <Field label="Nombre" required>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="input"
            placeholder="Ej: Crema hidratante 50ml"
          />
        </Field>

        <Field label="SKU" required>
          <input
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            required
            className="input"
            placeholder="Ej: SAD-CREMA-50"
          />
          {skuStatus === "checking" && (
            <p className="mt-1 text-xs text-white/40">Verificando...</p>
          )}
          {skuStatus === "available" && (
            <p className="mt-1 text-xs text-green-400">SKU disponible</p>
          )}
          {skuStatus === "taken" && (
            <p className="mt-1 text-xs text-red-400">SKU ya en uso</p>
          )}
        </Field>

        <Field label="EAN">
          <input
            value={ean}
            onChange={(e) => setEan(e.target.value)}
            className="input"
            placeholder="Código de barras"
          />
        </Field>

        <Field label="Stock inicial">
          <input
            type="number"
            min="0"
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            className="input"
          />
        </Field>

        <Field label="Marca">
          <input
            value={marca}
            onChange={(e) => setMarca(e.target.value)}
            className="input"
            placeholder="Ej: SADONA, L'Oréal..."
          />
        </Field>

        <button
          type="submit"
          disabled={saving || skuStatus === "taken"}
          className="w-full rounded-xl bg-[#E0457B] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#c93a6a] disabled:opacity-50"
        >
          {saving ? "Guardando..." : "Guardar producto"}
        </button>
      </form>
    </div>
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
      <span className="mb-1.5 block text-sm font-medium text-white/70">
        {label}
        {required && <span className="text-[#E0457B]"> *</span>}
      </span>
      {children}
    </label>
  );
}

export default function AddPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-center text-white/50">Cargando...</div>
      }
    >
      <AddPageContent />
    </Suspense>
  );
}

function AddPageContent() {
  const searchParams = useSearchParams();
  const prefillEan = searchParams.get("ean") ?? "";
  return <AddProductForm key={prefillEan || "new"} prefillEan={prefillEan} />;
}
