"use client";

import { useState } from "react";
import { updateProduct } from "@/app/actions/inventory";
import type { InventoryItem } from "@/lib/types";
import { toast } from "sonner";

type EditProductModalProps = {
  product: InventoryItem | null;
  onClose: () => void;
  onSaved: () => void;
};

export default function EditProductModal({
  product,
  onClose,
  onSaved,
}: EditProductModalProps) {
  if (!product) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1a1a1a]/95 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <h2 className="text-lg font-semibold">Editar producto</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-white/50 transition-colors hover:bg-white/5 hover:text-white"
          >
            ✕
          </button>
        </div>

        <EditProductForm
          key={product.id}
          product={product}
          onClose={onClose}
          onSaved={onSaved}
        />
      </div>
    </div>
  );
}

function EditProductForm({
  product,
  onClose,
  onSaved,
}: {
  product: InventoryItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(product.name);
  const [sku, setSku] = useState(product.sku);
  const [ean, setEan] = useState(product.ean ?? "");
  const [marca, setMarca] = useState(product.marca ?? "");
  const [unitPrice, setUnitPrice] = useState(
    product.unit_price != null ? String(product.unit_price) : ""
  );
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const result = await updateProduct(product.id, {
      name,
      sku,
      ean: ean || undefined,
      marca: marca || undefined,
      unit_price: unitPrice ? parseFloat(unitPrice) : undefined,
    });

    setSaving(false);

    if (result.success) {
      toast.success("Producto actualizado");
      onSaved();
      onClose();
    } else {
      toast.error(result.error);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-6">
      <Field label="Nombre" required>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="input"
        />
      </Field>
      <Field label="SKU" required>
        <input
          value={sku}
          onChange={(e) => setSku(e.target.value)}
          required
          className="input"
        />
      </Field>
      <Field label="EAN">
        <input
          value={ean}
          onChange={(e) => setEan(e.target.value)}
          className="input"
        />
      </Field>
      <Field label="Marca">
        <input
          value={marca}
          onChange={(e) => setMarca(e.target.value)}
          className="input"
        />
      </Field>
      <Field label="Precio unitario">
        <input
          type="number"
          min="0"
          step="0.01"
          value={unitPrice}
          onChange={(e) => setUnitPrice(e.target.value)}
          className="input"
          placeholder="0.00"
        />
      </Field>

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-white/70 transition-colors hover:bg-white/5"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-[#E0457B] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#c93a6a] disabled:opacity-50"
        >
          {saving ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </form>
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
