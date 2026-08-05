"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import type { Courier, Shipment } from "@/lib/types";

type ActionResult<T = void> =
  | { success: true; data?: T }
  | { success: false; error: string };

/** Registers a scanned package under a courier + shipment date. */
export async function createShipment(
  courier: Courier,
  packId: string,
  shipmentDate: string
): Promise<ActionResult<Shipment>> {
  const trimmed = packId.trim().replace(/\s+/g, " ");
  if (!trimmed) {
    return { success: false, error: "El código escaneado está vacío" };
  }

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("shipments")
    .insert({
      courier,
      pack_id: trimmed,
      shipment_date: shipmentDate,
      raw_qr: trimmed,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return {
        success: false,
        error: `Este paquete ya fue escaneado (${trimmed})`,
      };
    }
    return { success: false, error: error.message };
  }

  revalidatePath("/shipments");
  return { success: true, data: data as Shipment };
}

export async function deleteShipment(id: string): Promise<ActionResult> {
  const supabase = createServiceClient();

  const { error } = await supabase.from("shipments").delete().eq("id", id);
  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/shipments");
  return { success: true };
}

/** Loads every shipment ever recorded; calendar/week stats/search are all
 *  computed client-side from this, same pattern as the rest of the app. */
export async function getAllShipments() {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("shipments")
    .select("*")
    .order("shipment_date", { ascending: false });

  if (error) {
    return { success: false as const, error: error.message, data: [] };
  }

  return { success: true as const, data: (data ?? []) as Shipment[] };
}
