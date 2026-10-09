import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { canonicalValue } from "@/lib/normalize";
import {
  PRODUCT_COLUMNS,
  apiError,
  apiJson,
  apiOptions,
  authenticate,
  eanVariants,
  existingValues,
  findByCode,
  logAudit,
  productView,
  readJsonBody,
  validateEan,
  validatePrice,
  validateText,
} from "@/lib/api";

export const OPTIONS = apiOptions;

/**
 * GET /api/v1/products/{ean}
 * Busca por EAN o SKU. Tolera ceros iniciales (041554... = 41554...).
 */
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ ean: string }> }
) {
  const auth = await authenticate(request, "public");
  if ("response" in auth) return auth.response;

  const { ean } = await ctx.params;
  const variants = eanVariants(decodeURIComponent(ean));
  const list = variants.map((v) => `"${v.replace(/"/g, "")}"`).join(",");

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("inventory")
    .select(PRODUCT_COLUMNS)
    .or(`ean.in.(${list}),sku.in.(${list})`)
    .limit(5);

  if (error) return apiError(request, 500, "db_error", error.message);
  if (!data || data.length === 0) {
    return apiError(request, 404, "not_found", `No hay ningún producto con EAN/SKU ${ean}.`);
  }

  return apiJson(request, { data: productView(data[0] as never, auth.key.scope) });
}

const PATCH_FIELDS = new Set(["name", "ean", "sku", "marca", "supplier", "unit_price"]);

/**
 * PATCH /api/v1/products/{ean}   (key con scope 'write')
 * Edita datos del producto. Solo se tocan los campos que vengan en el body:
 *   name, ean, sku, marca, supplier, unit_price (null para borrarlo)
 * - Si cambia el 'ean', el SKU pasa a ser igual al nuevo EAN.
 * - 'sku' solo se puede cambiar en productos sin EAN.
 * - El stock NO se cambia acá: usá POST /products/{ean}/stock (deja historial).
 */
export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ ean: string }> }
) {
  const auth = await authenticate(request, "write");
  if ("response" in auth) return auth.response;

  const { ean: code } = await ctx.params;
  const parsed = await readJsonBody(request);
  if ("response" in parsed) return parsed.response;
  const body = parsed.body;

  if ("stock" in body) {
    return apiError(
      request,
      400,
      "use_stock_endpoint",
      "El stock no se edita con PATCH. Usá POST /products/{ean}/stock con {delta} o {set}."
    );
  }
  const unknown = Object.keys(body).filter((k) => !PATCH_FIELDS.has(k));
  if (unknown.length > 0) {
    return apiError(
      request,
      400,
      "unknown_field",
      `Campos no permitidos: ${unknown.join(", ")}. Permitidos: ${[...PATCH_FIELDS].join(", ")}.`
    );
  }
  if (Object.keys(body).length === 0) {
    return apiError(request, 400, "empty_body", "No mandaste ningún campo para actualizar.");
  }

  try {
    const found = await findByCode(decodeURIComponent(code));
    if (found.length === 0) {
      return apiError(request, 404, "not_found", `No hay ningún producto con EAN/SKU ${code}.`);
    }
    if (found.length > 1) {
      return apiError(
        request,
        409,
        "ambiguous",
        "Hay más de un producto con ese código. Corregilo desde la app antes de editarlo por API."
      );
    }
    const before = found[0];
    const update: Record<string, unknown> = {};

    if ("name" in body) {
      const v = validateText(body.name, "name", 200);
      if ("error" in v) return apiError(request, 400, "invalid_field", v.error);
      if (!v.value) return apiError(request, 400, "invalid_field", "'name' no puede quedar vacío.");
      update.name = v.value;
    }

    if ("ean" in body) {
      const v = validateEan(body.ean);
      if ("error" in v) return apiError(request, 400, "invalid_field", v.error);
      if (v.value) {
        const clash = (await findByCode(v.value)).filter((p) => p.id !== before.id);
        if (clash.length > 0) {
          return apiJson(
            request,
            {
              error: { code: "duplicate", message: "Ya hay otro producto con ese EAN/SKU." },
              existing: productView(clash[0], auth.key.scope),
            },
            { status: 409 }
          );
        }
        update.ean = v.value;
        update.sku = v.value; // SKU = EAN
      } else {
        update.ean = null;
      }
    }

    if ("sku" in body) {
      const v = validateText(body.sku, "sku", 60);
      if ("error" in v) return apiError(request, 400, "invalid_field", v.error);
      if (!v.value) return apiError(request, 400, "invalid_field", "'sku' no puede quedar vacío.");
      const hasEan = "ean" in update ? update.ean !== null : before.ean !== null;
      if (hasEan && v.value !== ((update.sku as string | undefined) ?? before.sku)) {
        return apiError(
          request,
          400,
          "sku_equals_ean",
          "Este producto tiene EAN y el SKU siempre es igual al EAN. Cambiá el 'ean' en vez del 'sku'."
        );
      }
      if (!hasEan) {
        const clash = (await findByCode(v.value)).filter((p) => p.id !== before.id);
        if (clash.length > 0) {
          return apiError(request, 409, "duplicate", "Ya hay otro producto con ese SKU.");
        }
        update.sku = v.value;
      }
    }

    if ("marca" in body) {
      const v = validateText(body.marca, "marca", 80);
      if ("error" in v) return apiError(request, 400, "invalid_field", v.error);
      update.marca = v.value ? canonicalValue(v.value, await existingValues("marca"), true) : null;
    }

    if ("supplier" in body) {
      const v = validateText(body.supplier, "supplier", 80);
      if ("error" in v) return apiError(request, 400, "invalid_field", v.error);
      update.supplier = v.value
        ? canonicalValue(v.value, await existingValues("supplier"), false)
        : null;
    }

    if ("unit_price" in body) {
      const v = validatePrice(body.unit_price);
      if ("error" in v) return apiError(request, 400, "invalid_field", v.error);
      update.unit_price = v.value;
    }

    update.updated_at = new Date().toISOString();

    const supabase = createServiceClient();
    const { data: after, error } = await supabase
      .from("inventory")
      .update(update)
      .eq("id", before.id)
      .select(PRODUCT_COLUMNS)
      .single();

    if (error || !after) {
      if (error?.code === "23505") {
        return apiError(request, 409, "duplicate", "Ya hay otro producto con ese SKU/EAN.");
      }
      return apiError(request, 500, "db_error", error?.message ?? "No se pudo actualizar.");
    }

    await logAudit({
      key: auth.key,
      action: "update",
      productId: before.id,
      productEan: after.ean,
      before,
      after,
    });

    revalidatePath("/");
    return apiJson(request, { data: productView(after as never, auth.key.scope) });
  } catch (e) {
    return apiError(request, 500, "db_error", e instanceof Error ? e.message : "Error");
  }
}

/**
 * DELETE /api/v1/products/{ean}?confirm=true[&force=true]   (key con scope 'write')
 * Elimina el producto Y TODO SU HISTORIAL (movimientos, ingresos, cambios de precio).
 * - Sin ?confirm=true no hace nada.
 * - Si el producto tiene stock > 0, además hace falta ?force=true.
 * Queda un snapshot completo en api_audit_log por si hay que recuperarlo.
 */
export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ ean: string }> }
) {
  const auth = await authenticate(request, "write");
  if ("response" in auth) return auth.response;

  const { ean: code } = await ctx.params;
  const sp = request.nextUrl.searchParams;

  try {
    const found = await findByCode(decodeURIComponent(code));
    if (found.length === 0) {
      return apiError(request, 404, "not_found", `No hay ningún producto con EAN/SKU ${code}.`);
    }
    if (found.length > 1) {
      return apiError(
        request,
        409,
        "ambiguous",
        "Hay más de un producto con ese código. Resolvelo desde la app antes de eliminar por API."
      );
    }
    const product = found[0];

    if (sp.get("confirm") !== "true") {
      return apiJson(
        request,
        {
          error: {
            code: "confirmation_required",
            message:
              "Eliminar borra el producto y todo su historial. Repetí el pedido con ?confirm=true para confirmar.",
          },
          product: productView(product, auth.key.scope),
        },
        { status: 400 }
      );
    }

    if (product.stock > 0 && sp.get("force") !== "true") {
      return apiJson(
        request,
        {
          error: {
            code: "has_stock",
            message: `El producto tiene ${product.stock} unidades en stock. Si de verdad querés eliminarlo, agregá ?force=true.`,
          },
          product: productView(product, auth.key.scope),
        },
        { status: 409 }
      );
    }

    // Primero el audit (con snapshot): si falla el borrado, queda igual el registro del intento.
    await logAudit({
      key: auth.key,
      action: "delete",
      productId: product.id,
      productEan: product.ean,
      before: product,
      after: null,
    });

    const supabase = createServiceClient();
    const { error } = await supabase.from("inventory").delete().eq("id", product.id);
    if (error) return apiError(request, 500, "db_error", error.message);

    revalidatePath("/");
    return apiJson(request, { data: { deleted: true, product: productView(product, auth.key.scope) } });
  } catch (e) {
    return apiError(request, 500, "db_error", e instanceof Error ? e.message : "Error");
  }
}
