"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import type { ProductFormData } from "@/lib/types";

type ActionResult<T = void> =
  | { success: true; data?: T }
  | { success: false; error: string };

export async function addProduct(
  data: ProductFormData
): Promise<ActionResult<{ id: string }>> {
  const supabase = createServiceClient();
  const initialStock = data.stock ?? 0;

  const { data: product, error } = await supabase
    .from("inventory")
    .insert({
      name: data.name,
      sku: data.sku,
      ean: data.ean || null,
      stock: initialStock,
      marca: data.marca || null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "El SKU ya existe" };
    }
    return { success: false, error: error.message };
  }

  if (initialStock > 0) {
    await supabase.from("stock_movements").insert({
      inventory_id: product.id,
      delta: initialStock,
      reason: "stock inicial",
    });
  }

  revalidatePath("/");
  revalidatePath("/scan");
  return { success: true, data: { id: product.id } };
}

export async function updateStock(
  id: string,
  delta: number,
  reason: string
): Promise<ActionResult<{ stock: number }>> {
  const supabase = createServiceClient();

  const { data: item, error: fetchError } = await supabase
    .from("inventory")
    .select("stock")
    .eq("id", id)
    .single();

  if (fetchError || !item) {
    return { success: false, error: "Producto no encontrado" };
  }

  const newStock = item.stock + delta;
  if (newStock < 0) {
    return { success: false, error: "El stock no puede quedar negativo" };
  }

  const { error: updateError } = await supabase
    .from("inventory")
    .update({ stock: newStock, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  const { error: movementError } = await supabase
    .from("stock_movements")
    .insert({ inventory_id: id, delta, reason });

  if (movementError) {
    return { success: false, error: movementError.message };
  }

  revalidatePath("/");
  revalidatePath("/scan");
  return { success: true, data: { stock: newStock } };
}

export async function updateProduct(
  id: string,
  data: ProductFormData
): Promise<ActionResult> {
  const supabase = createServiceClient();

  const { error } = await supabase
    .from("inventory")
    .update({
      name: data.name,
      sku: data.sku,
      ean: data.ean || null,
      marca: data.marca || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "El SKU ya existe" };
    }
    return { success: false, error: error.message };
  }

  revalidatePath("/");
  revalidatePath("/scan");
  return { success: true };
}

export async function deleteProduct(id: string): Promise<ActionResult> {
  const supabase = createServiceClient();

  const { error } = await supabase.from("inventory").delete().eq("id", id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/");
  revalidatePath("/scan");
  return { success: true };
}

export async function getMovements(inventoryId: string) {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("stock_movements")
    .select("*")
    .eq("inventory_id", inventoryId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return { success: false as const, error: error.message, data: [] };
  }

  return { success: true as const, data: data ?? [] };
}
