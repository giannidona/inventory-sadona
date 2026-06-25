"use server";

import { extractInvoiceFromDocument } from "@/lib/claude-invoice";
import type { ParsedInvoiceData } from "@/lib/claude-invoice";

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export async function parseInvoiceDocument(
  formData: FormData
): Promise<ActionResult<ParsedInvoiceData>> {
  const file = formData.get("file") as File | null;

  if (!file || file.size === 0) {
    return { success: false, error: "No se seleccionó ningún archivo" };
  }

  if (file.size > MAX_FILE_SIZE) {
    return {
      success: false,
      error: "El archivo es muy grande (máximo 10 MB)",
    };
  }

  const allowed = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
  ];
  if (!allowed.includes(file.type)) {
    return {
      success: false,
      error: "Formato no soportado. Usá PDF, JPG, PNG o WebP.",
    };
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString("base64");
    const data = await extractInvoiceFromDocument(base64, file.type);
    return { success: true, data };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Error al analizar la factura";
    return { success: false, error: message };
  }
}
