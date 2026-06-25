"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { generateSku } from "@/lib/invoice-utils";
import type {
  InvoiceLineInput,
  ProcessInvoiceInput,
  ProcessInvoiceResult,
} from "@/lib/types";

type ActionResult<T = void> =
  | { success: true; data?: T }
  | { success: false; error: string };

async function findProduct(
  supabase: ReturnType<typeof createServiceClient>,
  line: InvoiceLineInput
) {
  if (line.sku?.trim()) {
    const { data } = await supabase
      .from("inventory")
      .select("id, stock, name, sku")
      .eq("sku", line.sku.trim())
      .maybeSingle();
    if (data) return data;
  }

  if (line.ean?.trim()) {
    const { data } = await supabase
      .from("inventory")
      .select("id, stock, name, sku")
      .eq("ean", line.ean.trim())
      .maybeSingle();
    if (data) return data;
  }

  const { data } = await supabase
    .from("inventory")
    .select("id, stock, name, sku")
    .ilike("name", line.name.trim())
    .maybeSingle();

  return data;
}

export async function uploadInvoiceFile(
  formData: FormData
): Promise<ActionResult<{ path: string; fileName: string }>> {
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    return { success: false, error: "No se seleccionó ningún archivo" };
  }

  const supabase = createServiceClient();
  const ext = file.name.split(".").pop() ?? "bin";
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error } = await supabase.storage
    .from("invoices")
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) {
    return { success: false, error: `Error al subir archivo: ${error.message}` };
  }

  return { success: true, data: { path, fileName: file.name } };
}

export async function processInvoice(
  input: ProcessInvoiceInput,
  fileInfo?: { path: string; fileName: string }
): Promise<ActionResult<ProcessInvoiceResult>> {
  if (!input.invoice_number.trim()) {
    return { success: false, error: "El número de factura es obligatorio" };
  }
  if (input.lines.length === 0) {
    return { success: false, error: "Agregá al menos un producto a la factura" };
  }

  const supabase = createServiceClient();

  if (input.cae?.trim()) {
    const { data: existing } = await supabase
      .from("invoices")
      .select("id, invoice_number")
      .eq("cae", input.cae.trim())
      .maybeSingle();

    if (existing) {
      return {
        success: false,
        error: `Esta factura ya fue procesada (${existing.invoice_number})`,
      };
    }
  }

  const lineTotal = input.lines.reduce(
    (sum, line) => sum + (line.unit_price ?? 0) * line.quantity,
    0
  );
  const total = input.total ?? (lineTotal > 0 ? lineTotal : null);

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .insert({
      invoice_number: input.invoice_number.trim(),
      invoice_type: input.invoice_type?.trim() || null,
      invoice_date: input.invoice_date || null,
      supplier: input.supplier?.trim() || null,
      supplier_cuit: input.supplier_cuit?.trim() || null,
      cae: input.cae?.trim() || null,
      cae_expiry: input.cae_expiry || null,
      notes: input.notes?.trim() || null,
      file_path: fileInfo?.path ?? null,
      file_name: fileInfo?.fileName ?? null,
      subtotal: input.subtotal ?? null,
      iva_amount: input.iva_amount ?? null,
      total,
      total_units: input.total_units ?? null,
      item_count: input.item_count ?? input.lines.length,
    })
    .select("id")
    .single();

  if (invoiceError || !invoice) {
    return {
      success: false,
      error: invoiceError?.message ?? "Error al guardar la factura",
    };
  }

  const reason = `factura #${input.invoice_number.trim()}`;
  const results: ProcessInvoiceResult["items"] = [];
  let created = 0;
  let updated = 0;

  for (const line of input.lines) {
    if (!line.name.trim() || line.quantity <= 0) continue;

    let product = await findProduct(supabase, line);
    let action: "created" | "updated";

    if (!product) {
      const sku = line.sku?.trim() || generateSku(line.name);
      const { data: newProduct, error: createError } = await supabase
        .from("inventory")
        .insert({
          name: line.name.trim(),
          sku,
          ean: line.ean?.trim() || null,
          marca: line.marca?.trim() || null,
          stock: line.quantity,
          unit_price: line.unit_price ?? null,
        })
        .select("id, stock, name, sku")
        .single();

      if (createError || !newProduct) {
        return {
          success: false,
          error: `Error al crear "${line.name}": ${createError?.message}`,
        };
      }

      await supabase.from("stock_movements").insert({
        inventory_id: newProduct.id,
        delta: line.quantity,
        reason,
      });

      product = newProduct;
      action = "created";
      created++;
    } else {
      const newStock = product.stock + line.quantity;
      const updateData: Record<string, unknown> = {
        stock: newStock,
        updated_at: new Date().toISOString(),
      };
      if (line.unit_price != null) {
        updateData.unit_price = line.unit_price;
      }

      const { error: updateError } = await supabase
        .from("inventory")
        .update(updateData)
        .eq("id", product.id);

      if (updateError) {
        return {
          success: false,
          error: `Error al actualizar "${line.name}": ${updateError.message}`,
        };
      }

      await supabase.from("stock_movements").insert({
        inventory_id: product.id,
        delta: line.quantity,
        reason,
      });

      product = { ...product, stock: newStock };
      action = "updated";
      updated++;
    }

    await supabase.from("invoice_items").insert({
      invoice_id: invoice.id,
      inventory_id: product.id,
      product_name: line.name.trim(),
      sku: product.sku,
      quantity: line.quantity,
      unit_price: line.unit_price ?? null,
    });

    results.push({
      product_name: line.name.trim(),
      action,
      new_stock: product.stock,
    });
  }

  revalidatePath("/");
  revalidatePath("/invoices");
  revalidatePath("/scan");

  return {
    success: true,
    data: {
      invoice_id: invoice.id,
      created,
      updated,
      items: results,
    },
  };
}

export async function getInvoices() {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("invoices")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return { success: false as const, error: error.message, data: [] };
  }

  return { success: true as const, data: data ?? [] };
}

export async function getInvoiceWithItems(invoiceId: string) {
  const supabase = createServiceClient();

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .single();

  if (invoiceError || !invoice) {
    return { success: false as const, error: "Factura no encontrada", data: null };
  }

  const { data: items, error: itemsError } = await supabase
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("created_at");

  if (itemsError) {
    return { success: false as const, error: itemsError.message, data: null };
  }

  return {
    success: true as const,
    data: { invoice, items: items ?? [] },
  };
}

export async function getInvoiceFileUrl(
  filePath: string
): Promise<ActionResult<{ url: string }>> {
  const supabase = createServiceClient();

  const { data, error } = await supabase.storage
    .from("invoices")
    .createSignedUrl(filePath, 3600);

  if (error || !data?.signedUrl) {
    return { success: false, error: "No se pudo obtener el archivo" };
  }

  return { success: true, data: { url: data.signedUrl } };
}
