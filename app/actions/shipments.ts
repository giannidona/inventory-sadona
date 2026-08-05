"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { parseShipmentQr } from "@/lib/shipment-qr";
import type { Courier, Shipment } from "@/lib/types";

type ActionResult<T = void> =
  | { success: true; data?: T }
  | { success: false; error: string };

/** Registers a scanned package under a courier + shipment date. */
export async function createShipment(
  courier: Courier,
  rawQr: string,
  shipmentDate: string
): Promise<ActionResult<Shipment>> {
  const trimmed = rawQr.trim();
  if (!trimmed) {
    return { success: false, error: "El código escaneado está vacío" };
  }

  const parsed = parseShipmentQr(trimmed);
  if (!parsed.envioId) {
    return { success: false, error: "No se pudo leer el código escaneado" };
  }

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("shipments")
    .insert({
      courier,
      envio_id: parsed.envioId,
      sender_id: parsed.senderId,
      hash_code: parsed.hashCode,
      security_digit: parsed.securityDigit,
      shipment_date: shipmentDate,
      raw_qr: parsed.raw,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return {
        success: false,
        error: `Este envío ya fue escaneado (${parsed.envioId})`,
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
