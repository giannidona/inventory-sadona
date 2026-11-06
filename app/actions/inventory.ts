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
      supplier: data.supplier || null,
      unit_price: data.unit_price ?? null,
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
): Promise<ActionResult<{ stock: number; movementId?: string }>> {
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

  const { data: movement, error: movementError } = await supabase
    .from("stock_movements")
    .insert({ inventory_id: id, delta, reason })
    .select("id")
    .single();

  if (movementError) {
    return { success: false, error: movementError.message };
  }

  revalidatePath("/");
  revalidatePath("/scan");
  return { success: true, data: { stock: newStock, movementId: movement?.id } };
}

/**
 * Deshace un movimiento (por ejemplo un escaneo equivocado): revierte su efecto en el
 * stock y borra el registro, así todo queda como si nunca hubiera pasado.
 */
export async function undoMovement(
  movementId: string
): Promise<ActionResult<{ inventoryId: string; stock: number }>> {
  const supabase = createServiceClient();

  const { data: movement, error: movError } = await supabase
    .from("stock_movements")
    .select("id, inventory_id, delta")
    .eq("id", movementId)
    .maybeSingle();

  if (movError) return { success: false, error: movError.message };
  if (!movement) return { success: false, error: "El movimiento ya no existe" };

  const { data: item, error: itemError } = await supabase
    .from("inventory")
    .select("stock")
    .eq("id", movement.inventory_id)
    .single();

  if (itemError || !item) return { success: false, error: "Producto no encontrado" };

  const newStock = item.stock - movement.delta;
  if (newStock < 0) {
    return {
      success: false,
      error: "No se puede deshacer: el stock quedaría negativo (ya se usó esa mercadería)",
    };
  }

  // update condicional: si el stock cambió mientras tanto, no se pisa
  const { data: updated, error: updateError } = await supabase
    .from("inventory")
    .update({ stock: newStock, updated_at: new Date().toISOString() })
    .eq("id", movement.inventory_id)
    .eq("stock", item.stock)
    .select("id")
    .maybeSingle();

  if (updateError) return { success: false, error: updateError.message };
  if (!updated) return { success: false, error: "El stock cambió mientras se deshacía. Reintentá." };

  const { error: delError } = await supabase.from("stock_movements").delete().eq("id", movementId);
  if (delError) {
    // dejar el stock como estaba para no quedar inconsistente con el historial
    await supabase.from("inventory").update({ stock: item.stock }).eq("id", movement.inventory_id);
    return { success: false, error: delError.message };
  }

  revalidatePath("/");
  revalidatePath("/scan");
  return { success: true, data: { inventoryId: movement.inventory_id, stock: newStock } };
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
      supplier: data.supplier || null,
      unit_price: data.unit_price ?? null,
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
