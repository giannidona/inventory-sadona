import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { IVA_RATE } from "@/lib/invoice-utils";
import { canonicalValue } from "@/lib/normalize";
import {
  PRODUCT_COLUMNS,
  apiError,
  apiJson,
  apiOptions,
  authenticate,
  existingValues,
  findByCode,
  logAudit,
  parseIntParam,
  productView,
  readJsonBody,
  validateEan,
  validateInt,
  validatePrice,
  validateText,
} from "@/lib/api";

export const OPTIONS = apiOptions;

/**
 * GET /api/v1/arrivals   (solo key privada)
 * Todo lo que entró por factura, con el precio anterior si cambió.
 *   since    fecha ISO (ej. 2026-10-01) -> solo ingresos desde ahí
 *   is_new   true -> solo productos que se crearon con esa factura
 *   limit 1-500 (default 100)   offset
 */
export async function GET(request: NextRequest) {
  const auth = await authenticate(request, "private");
  if ("response" in auth) return auth.response;

  const sp = request.nextUrl.searchParams;
  const limit = parseIntParam(sp.get("limit"), 100, 1, 500);
  const offset = parseIntParam(sp.get("offset"), 0, 0, 1_000_000);

  const supabase = createServiceClient();
  let query = supabase
    .from("stock_arrivals")
    .select("*, invoices(invoice_number, supplier)", { count: "exact" });

  const since = sp.get("since");
  if (since) {
    const d = new Date(since);
    if (Number.isNaN(d.getTime())) {
      return apiError(request, 400, "bad_request", "'since' no es una fecha válida (usá YYYY-MM-DD).");
    }
    query = query.gte("created_at", d.toISOString());
  }
  if (sp.get("is_new") === "true") query = query.eq("is_new", true);

  const [arrivalsRes, priceChangesRes] = await Promise.all([
    query.order("created_at", { ascending: false }).range(offset, offset + limit - 1),
    supabase.from("price_changes").select("invoice_id, inventory_id, old_price"),
  ]);

  if (arrivalsRes.error) return apiError(request, 500, "db_error", arrivalsRes.error.message);

  const oldPrice = new Map<string, number>();
  for (const pc of priceChangesRes.data ?? []) {
    if (pc.invoice_id && pc.inventory_id) {
      oldPrice.set(`${pc.invoice_id}:${pc.inventory_id}`, Number(pc.old_price));
    }
  }

  const data = (arrivalsRes.data ?? []).map((a) => ({
    id: a.id,
    created_at: a.created_at,
    product_name: a.product_name,
    sku: a.sku,
    ean: a.ean,
    quantity_added: a.quantity_added,
    new_stock: a.new_stock,
    unit_price: a.unit_price != null ? Number(a.unit_price) : null,
    old_price:
      a.old_price != null
        ? Number(a.old_price)
        : a.invoice_id && a.inventory_id
          ? (oldPrice.get(`${a.invoice_id}:${a.inventory_id}`) ?? null)
          : null,
    is_new: a.is_new,
    source: a.source ?? "invoice",
    invoice_number: a.invoices?.invoice_number ?? null,
    supplier: a.invoices?.supplier ?? a.supplier ?? null,
  }));

  return apiJson(request, {
    data,
    meta: { total: arrivalsRes.count ?? 0, limit, offset },
  });
}

const ALLOWED_IVA = [0, 0.105, 0.21, 0.27];
const ARRIVAL_FIELDS = new Set([
  "ean",
  "name",
  "marca",
  "quantity",
  "cost",
  "price_includes_iva",
  "iva_rate",
  "supplier",
  "dry_run",
]);

/**
 * POST /api/v1/arrivals   (key con scope 'write')
 * Registra una compra / ingreso a mano (sin factura): suma stock, actualiza el costo
 * y "dónde se compró". Si el EAN no existe, crea el producto. Queda en la pestaña
 * Ingresos (con la ⭐ si es nuevo) y en el historial de movimientos.
 *
 * Body JSON:
 *   ean                 (obligatorio) dígitos; tolera ceros iniciales de más o de menos
 *   quantity            unidades que entraron (entero >= 0; se SUMAN al stock actual)
 *   cost                costo unitario de compra (opcional)
 *   price_includes_iva  OBLIGATORIO si viene 'cost': true = el costo ya incluye IVA
 *                       (se le saca), false = ya es neto. Nunca se asume.
 *   iva_rate            0 | 0.105 | 0.21 | 0.27 (default 0.21)
 *   supplier            dónde se compró (se reutiliza la escritura existente: "Doan", "CEMAFELU S.A.")
 *   name                OBLIGATORIO solo si el EAN todavía no existe (producto nuevo)
 *   marca               solo para productos nuevos
 *   dry_run             true -> NO escribe nada: devuelve qué pasaría (para confirmar antes)
 *
 * unit_price queda guardado NETO (sin IVA): cost / (1 + iva_rate), redondeado a 2 decimales.
 */
export async function POST(request: NextRequest) {
  const auth = await authenticate(request, "write");
  if ("response" in auth) return auth.response;

  const parsed = await readJsonBody(request);
  if ("response" in parsed) return parsed.response;
  const body = parsed.body;

  const unknown = Object.keys(body).filter((k) => !ARRIVAL_FIELDS.has(k));
  if (unknown.length > 0) {
    return apiError(
      request,
      400,
      "unknown_field",
      `Campos no permitidos: ${unknown.join(", ")}. Permitidos: ${[...ARRIVAL_FIELDS].join(", ")}.`
    );
  }

  const eanV = validateEan(body.ean);
  if ("error" in eanV) return apiError(request, 400, "invalid_field", eanV.error);
  if (!eanV.value) return apiError(request, 400, "invalid_field", "'ean' es obligatorio.");
  const ean = eanV.value;

  const qtyV = body.quantity === undefined ? { value: 0 } : validateInt(body.quantity, "quantity", 0);
  if ("error" in qtyV) return apiError(request, 400, "invalid_field", qtyV.error);
  const quantity = qtyV.value;

  // costo + IVA: el flag es obligatorio para no adivinar nunca
  let netCost: number | null = null;
  let ivaRate = IVA_RATE;
  let costInput: number | null = null;
  const hasCost = body.cost !== undefined && body.cost !== null;
  if (hasCost) {
    const c = validatePrice(body.cost);
    if ("error" in c) return apiError(request, 400, "invalid_field", c.error.replace("'unit_price'", "'cost'"));
    if (typeof body.price_includes_iva !== "boolean") {
      return apiError(
        request,
        400,
        "iva_required",
        "Falta 'price_includes_iva' (true/false): indicá si el costo ya incluye IVA o es neto. No se asume."
      );
    }
    if (body.iva_rate !== undefined) {
      if (typeof body.iva_rate !== "number" || !ALLOWED_IVA.includes(body.iva_rate)) {
        return apiError(request, 400, "invalid_field", `'iva_rate' tiene que ser uno de: ${ALLOWED_IVA.join(", ")}.`);
      }
      ivaRate = body.iva_rate;
    }
    costInput = c.value as number;
    netCost = body.price_includes_iva
      ? Math.round((costInput / (1 + ivaRate)) * 100) / 100
      : costInput;
  }

  const supplierIn = validateText(body.supplier, "supplier", 80);
  if ("error" in supplierIn) return apiError(request, 400, "invalid_field", supplierIn.error);
  const nameIn = validateText(body.name, "name", 200);
  if ("error" in nameIn) return apiError(request, 400, "invalid_field", nameIn.error);
  const marcaIn = validateText(body.marca, "marca", 80);
  if ("error" in marcaIn) return apiError(request, 400, "invalid_field", marcaIn.error);
  if (body.dry_run !== undefined && typeof body.dry_run !== "boolean") {
    return apiError(request, 400, "invalid_field", "'dry_run' tiene que ser true o false.");
  }
  const dryRun = body.dry_run === true;

  if (quantity === 0 && netCost === null && !supplierIn.value) {
    return apiError(request, 400, "empty_arrival", "No hay nada para registrar: mandá 'quantity', 'cost' o 'supplier'.");
  }

  try {
    const found = await findByCode(ean);
    if (found.length > 1) {
      return apiError(request, 409, "ambiguous", "Hay más de un producto con ese código; resolvelo desde la app.");
    }
    const before = found[0] ?? null;
    const isNew = before === null;

    if (isNew && !nameIn.value) {
      return apiError(
        request,
        422,
        "needs_name",
        `El EAN ${ean} no existe en el inventario. Para crearlo hace falta 'name' (y opcionalmente 'marca').`
      );
    }

    const warnings: string[] = [];
    const supplier = supplierIn.value
      ? canonicalValue(supplierIn.value, await existingValues("supplier"), false)
      : null;
    if (supplierIn.value && supplier !== supplierIn.value) {
      warnings.push(`El proveedor se guardó como "${supplier}" (ya existía así en el inventario).`);
    }
    let marca: string | null = null;
    if (isNew && marcaIn.value) {
      const existingMarcas = await existingValues("marca");
      marca = canonicalValue(marcaIn.value, existingMarcas, true);
      if (!existingMarcas.some((m) => m === marca)) warnings.push(`La marca "${marca}" es nueva (no existía en el inventario).`);
    }
    if (!isNew && (marcaIn.value || nameIn.value)) {
      warnings.push("El producto ya existe: 'name' y 'marca' se ignoraron. Para cambiarlos usá PATCH /products/{ean}.");
    }

    const oldPrice = before?.unit_price != null ? Number(before.unit_price) : null;
    const priceChanged =
      netCost !== null && oldPrice !== null && Math.round(netCost * 100) !== Math.round(oldPrice * 100);
    if (priceChanged && oldPrice) {
      const pct = ((netCost! - oldPrice) / oldPrice) * 100;
      if (Math.abs(pct) >= 30) warnings.push(`El costo cambia ${pct > 0 ? "+" : ""}${pct.toFixed(1)}% respecto del actual: revisalo.`);
    }
    if (before && netCost === null && oldPrice === null) warnings.push("El producto no tiene costo cargado.");

    const newStock = (before?.stock ?? 0) + quantity;
    const preview = {
      action: isNew ? "create" : "update",
      product: {
        ean,
        name: before?.name ?? nameIn.value,
        marca: before?.marca ?? marca,
      },
      stock: { from: before?.stock ?? 0, to: newStock, added: quantity },
      unit_price:
        netCost === null
          ? { from: oldPrice, to: oldPrice, changed: false }
          : { from: oldPrice, to: netCost, changed: priceChanged || isNew },
      cost_calculation:
        netCost === null
          ? null
          : {
              input: costInput,
              includes_iva: body.price_includes_iva === true,
              iva_rate: ivaRate,
              net: netCost,
            },
      supplier: { from: before?.supplier ?? null, to: supplier ?? before?.supplier ?? null },
      warnings,
    };

    if (dryRun) return apiJson(request, { dry_run: true, ...preview });

    const supabase = createServiceClient();
    let productId: string;
    let after: Record<string, unknown>;

    if (isNew) {
      const { data: created, error } = await supabase
        .from("inventory")
        .insert({
          name: nameIn.value,
          sku: ean, // SKU = EAN
          ean,
          marca,
          supplier,
          unit_price: netCost,
          stock: quantity,
        })
        .select(PRODUCT_COLUMNS)
        .single();
      if (error || !created) {
        if (error?.code === "23505") return apiError(request, 409, "duplicate", "Ya existe un producto con ese EAN/SKU.");
        return apiError(request, 500, "db_error", error?.message ?? "No se pudo crear el producto.");
      }
      productId = created.id;
      after = created;
    } else {
      const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (quantity > 0) update.stock = newStock;
      if (netCost !== null) update.unit_price = netCost;
      if (supplier) update.supplier = supplier;
      // update condicional por stock: si alguien lo movió en el medio, no se pisa
      const { data: updated, error } = await supabase
        .from("inventory")
        .update(update)
        .eq("id", before!.id)
        .eq("stock", before!.stock)
        .select(PRODUCT_COLUMNS)
        .maybeSingle();
      if (error) return apiError(request, 500, "db_error", error.message);
      if (!updated) return apiError(request, 409, "conflict", "El stock cambió mientras se procesaba el pedido. Reintentá.");
      productId = before!.id;
      after = updated;
    }

    const reason = `ingreso manual${supplier ? ` (${supplier})` : ""} [${auth.key.name}]`;
    if (quantity > 0) {
      await supabase.from("stock_movements").insert({ inventory_id: productId, delta: quantity, reason });
    }
    if (priceChanged && oldPrice !== null && netCost !== null) {
      await supabase.from("price_changes").insert({
        invoice_id: null,
        inventory_id: productId,
        product_name: (after.name as string) ?? nameIn.value,
        sku: ean,
        old_price: oldPrice,
        new_price: netCost,
      });
    }
    if (quantity > 0) {
      await supabase.from("stock_arrivals").insert({
        invoice_id: null,
        inventory_id: productId,
        product_name: after.name as string,
        sku: after.sku as string,
        ean,
        quantity_added: quantity,
        new_stock: after.stock as number,
        unit_price: netCost ?? oldPrice,
        old_price: priceChanged ? oldPrice : null,
        supplier: supplier ?? (after.supplier as string | null) ?? null,
        source: "manual",
        is_new: isNew,
      });
    }

    await logAudit({
      key: auth.key,
      action: isNew ? "create" : "update",
      productId,
      productEan: ean,
      before,
      after: { ...after, via: "arrivals", quantity_added: quantity, cost_input: costInput, includes_iva: body.price_includes_iva ?? null },
    });

    revalidatePath("/");
    revalidatePath("/stock-arrivals");
    return apiJson(
      request,
      { dry_run: false, ...preview, data: productView(after as never, auth.key.scope) },
      { status: isNew ? 201 : 200 }
    );
  } catch (e) {
    return apiError(request, 500, "db_error", e instanceof Error ? e.message : "Error");
  }
}
