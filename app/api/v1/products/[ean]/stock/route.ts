import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import {
  PRODUCT_COLUMNS,
  apiError,
  apiJson,
  apiOptions,
  authenticate,
  findByCode,
  logAudit,
  productView,
  readJsonBody,
  validateInt,
  validateText,
} from "@/lib/api";

export const OPTIONS = apiOptions;

/**
 * POST /api/v1/products/{ean}/stock   (key con scope 'write')
 * Ajusta el stock y deja el movimiento en el historial. Body JSON, UNA de estas dos:
 *   { "delta": -2 }   suma/resta (entero distinto de 0)
 *   { "set": 10 }     fija el stock exacto (entero >= 0)
 * Opcional: "reason" (texto corto, ej. "venta mostrador", "recuento").
 * El stock no puede quedar negativo.
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ ean: string }> }
) {
  const auth = await authenticate(request, "write");
  if ("response" in auth) return auth.response;

  const { ean: code } = await ctx.params;
  const parsed = await readJsonBody(request);
  if ("response" in parsed) return parsed.response;
  const body = parsed.body;

  const unknown = Object.keys(body).filter((k) => !["delta", "set", "reason"].includes(k));
  if (unknown.length > 0) {
    return apiError(request, 400, "unknown_field", `Campos no permitidos: ${unknown.join(", ")}.`);
  }
  if (("delta" in body) === ("set" in body)) {
    return apiError(request, 400, "invalid_field", "Mandá exactamente uno: 'delta' o 'set'.");
  }

  const reasonIn = body.reason === undefined ? { value: null } : validateText(body.reason, "reason", 120);
  if ("error" in reasonIn) return apiError(request, 400, "invalid_field", reasonIn.error);

  let delta: number | null = null;
  let setTo: number | null = null;
  if ("delta" in body) {
    const v = validateInt(body.delta, "delta", Number.MIN_SAFE_INTEGER);
    if ("error" in v) return apiError(request, 400, "invalid_field", v.error);
    if (v.value === 0) return apiError(request, 400, "invalid_field", "'delta' no puede ser 0.");
    delta = v.value;
  } else {
    const v = validateInt(body.set, "set", 0);
    if ("error" in v) return apiError(request, 400, "invalid_field", v.error);
    setTo = v.value;
  }

  try {
    const found = await findByCode(decodeURIComponent(code));
    if (found.length === 0) {
      return apiError(request, 404, "not_found", `No hay ningún producto con EAN/SKU ${code}.`);
    }
    if (found.length > 1) {
      return apiError(request, 409, "ambiguous", "Hay más de un producto con ese código; resolvelo desde la app.");
    }
    const before = found[0];

    const realDelta = delta ?? (setTo as number) - before.stock;
    const newStock = before.stock + realDelta;
    if (newStock < 0) {
      return apiError(
        request,
        409,
        "negative_stock",
        `Stock insuficiente: hay ${before.stock} y se intentó restar ${-realDelta}.`
      );
    }
    if (realDelta === 0) {
      return apiJson(request, { data: productView(before, auth.key.scope), meta: { changed: false } });
    }

    const supabase = createServiceClient();
    // Update condicional: si alguien movió el stock entre la lectura y la escritura, no pisa nada.
    const { data: after, error } = await supabase
      .from("inventory")
      .update({ stock: newStock, updated_at: new Date().toISOString() })
      .eq("id", before.id)
      .eq("stock", before.stock)
      .select(PRODUCT_COLUMNS)
      .maybeSingle();

    if (error) return apiError(request, 500, "db_error", error.message);
    if (!after) {
      return apiError(request, 409, "conflict", "El stock cambió mientras se procesaba el pedido. Reintentá.");
    }

    const reason = `${reasonIn.value ?? (setTo !== null ? "ajuste por API (recuento)" : "ajuste por API")} [${auth.key.name}]`;
    await supabase
      .from("stock_movements")
      .insert({ inventory_id: before.id, delta: realDelta, reason });

    await logAudit({
      key: auth.key,
      action: "stock",
      productId: before.id,
      productEan: after.ean,
      before: { stock: before.stock },
      after: { stock: after.stock, delta: realDelta, reason },
    });

    revalidatePath("/");
    return apiJson(request, {
      data: productView(after as never, auth.key.scope),
      meta: { changed: true, delta: realDelta, previous_stock: before.stock },
    });
  } catch (e) {
    return apiError(request, 500, "db_error", e instanceof Error ? e.message : "Error");
  }
}
