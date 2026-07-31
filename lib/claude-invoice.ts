import {
  normalizeInvoiceLine,
  parseArgentineNumber,
} from "@/lib/invoice-utils";
import type { InvoiceLineInput, ProcessInvoiceInput } from "@/lib/types";

export type ParsedInvoiceData = ProcessInvoiceInput;

const EXTRACTION_PROMPT = `Sos un extractor de facturas argentinas de mayoristas (formato doan / CEMAFELU / similares).

IMPORTANTE: Si el PDF tiene MÚLTIPLES PÁGINAS, leé TODAS las páginas y extraé TODOS los ítems de la tabla de productos. No omitas ninguna línea.

## Formato típico de la factura
- Encabezado: proveedor (ej: CEMAFELU S.A.), CUIT, domicilio, "Factura A" o "Factura B"
- Número de factura: formato XXXX-XXXXXXXX (ej: 0009-000074590)
- Fecha: DD/MM/YY (a veces con hora al lado, ej: "28/07/26 - 12:04:26" → usá solo la fecha)
- Precios en formato argentino: coma decimal, punto miles (ej: "662,44" = 662.44, "397.284,44" = 397284.44)
- La primera palabra del nombre del producto (después del código) suele ser la marca

## La tabla de productos puede venir en DOS formatos distintos — fijate cuál es antes de extraer

**Formato A** (columnas: CANTIDAD | DESCRIPCION | P.UNIT. | IVA | IMPORTE):
- DESCRIPCION: "CODIGO-NOMBRE" donde CODIGO tiene 4 a 6 dígitos → es el SKU interno del mayorista
- CANTIDAD viene como "4,000 Unid" = 4 unidades (la coma y los ceros son decimales de presentación, NO miles)
- P.UNIT. = precio unitario por unidad, se usa directo

**Formato B**, más nuevo (columnas: DESCRIPCION | P.LISTA | DTO | P.UNIT | UNIDAD | IVA | IMPORTE):
- DESCRIPCION: "CODIGO-NOMBRE" donde CODIGO tiene 8 dígitos o más (EAN-13/UPC-A, código de barras) → NO es un SKU, es el EAN del producto
- UNIDAD viene como número entero simple (ej: "6", "12", "24"), sin ", Unid" — es la cantidad
- P.LISTA es el precio de lista SIN descuento — IGNORALO
- P.UNIT es el precio YA con el descuento (DTO) aplicado — ese es el que va en unit_price
- Esta es la factura de este tipo. Este formato ya NO trae el SKU interno, solo el EAN.

## Cómo clasificar el código antes del guión en DESCRIPCION (en cualquiera de los dos formatos)
- 4 a 6 dígitos → campo "sku", dejá "ean" en null
- 8 dígitos o más → campo "ean", dejá "sku" en null
NUNCA pongas el mismo valor en los dos campos a la vez.

## Totales (pie de factura)
Algunas facturas muestran primero "Total Sin Descuentos" y una sección de "DESCUENTOS /
BONIFICACIONES" (montos negativos), y recién después la tabla final con SubTotal /
Alicuota IVA / Total IVA / Perc.IVA / Importe Total.
- Usá SIEMPRE los valores de esa tabla FINAL (ya con descuentos aplicados), nunca "Total Sin Descuentos"
- subtotal = "SubTotal" de esa tabla final
- iva_amount = "Total IVA" (NO "Perc.IVA", que es una percepción/retención distinta)
- total = "Importe Total" (el número final)
- También están: CAE, vencimiento CAE, TOTAL UNIDADES, cantidad de ítems (Items)

## Respondé ÚNICAMENTE con JSON válido (sin markdown):
{
  "invoice_number": "0009-000074590",
  "invoice_type": "A",
  "supplier": "CEMAFELU S.A.",
  "supplier_cuit": "30710164637",
  "invoice_date": "2026-07-28",
  "cae": "86305743229654",
  "cae_expiry": "2026-07-28",
  "subtotal": 875578.63,
  "iva_amount": 183871.51,
  "total": 1080669.29,
  "total_units": 160,
  "item_count": 27,
  "notes": "observaciones del pie de factura o null",
  "lines": [
    {
      "description": "7798140259435-ASEPXIA CARBON GEL EXFO x120",
      "sku": null,
      "ean": "7798140259435",
      "name": "ASEPXIA CARBON GEL EXFO x120",
      "marca": "ASEPXIA",
      "quantity": 6,
      "unit_price": 7177.10
    }
  ]
}

## Reglas estrictas
1. Incluí TODOS los productos de TODAS las páginas del PDF
2. quantity: entero positivo. "4,000 Unid" → 4. Número simple como "6" → 6 directo
3. unit_price: número decimal con punto (convertí de formato argentino). Si hay P.LISTA y P.UNIT, usá SIEMPRE P.UNIT (con descuento), nunca P.LISTA
4. Código antes del guión en DESCRIPCION: 4-6 dígitos → "sku" (dejando "ean" null), 8+ dígitos → "ean" (dejando "sku" null). Nunca los dos a la vez
5. name: texto después del guión, sin el código
6. item_count: cantidad total de líneas/ítems que indica la factura (ej: "Items: 27")
7. total_units: suma de unidades del pie (ej: "TOTAL UNIDADES: 160")
8. subtotal/iva_amount/total: SIEMPRE de la tabla final post-descuentos, nunca de "Total Sin Descuentos"
9. invoice_date y cae_expiry en formato ISO YYYY-MM-DD
10. Si un campo no aparece, usá null
11. NO inventes productos que no estén en la factura
12. NO omitas líneas aunque el PDF sea largo`;

const PEDIDO_EXTRACTION_PROMPT = `Sos un extractor de "pedidos" (órdenes de compra a mayoristas), un formato de documento distinto al de factura fiscal.

IMPORTANTE: Si el documento tiene MÚLTIPLES PÁGINAS, leé TODAS las páginas y extraé TODOS los ítems. No omitas ninguna línea.

## Formato del pedido
Es una lista numerada de productos, una línea (a veces dos, cuando el nombre es largo y envuelve) por ítem:

  N) SKU  CANTIDAD x  DESCRIPCION   PRECIO_UNITARIO   IMPORTE

Ejemplos reales:
  "1) 51000  12 x RTO MACH 3 TURBO - X 4 (X PACK)  9516.00  114192.00"
  "2) 4217  12 x EXCELLENCE RUBIO ULTRA CLARO CENIZA TONO 121 KITx1  12339.00  148068.00"
  (la descripción a veces continúa en una segunda línea antes del precio, ej. "KITx1" o "400 ML." — unila con el resto del nombre)
  "16) 1653  6 x GARNIER SKIN ACT AGUA MICELAR ANTI IMPERF 400 ML.  11779.00  70674.00"

- SKU: el número justo después de "N)", 4-6 dígitos — es el código interno del mayorista
- CANTIDAD: el número antes de "x" (ej. "12 x" = 12 unidades)
- DESCRIPCION: el texto entre la cantidad y el precio unitario (uniendo líneas que envuelven)
- PRECIO_UNITARIO: primer número de precio en la línea
- IMPORTE: segundo número (= cantidad × precio unitario, usalo solo para verificar, no hace falta reportarlo)
- Precios en formato con punto decimal (ej. "9516.00" = 9516.00), no confundir con formato argentino de coma decimal

## Pie del pedido
Al final aparecen estos datos (pueden variar el orden):
- "Unidades: N" → total_units
- "Pedido: P-XXXX-XXXXXXXX" → usalo como invoice_number
- "Cliente: CODIGO-NOMBRE (X)" → quién hizo el pedido, va en notes como "Cliente: ..."
- "Fecha: DD/MM/YYYY" → invoice_date
- "Vendedor: CODIGO-NOMBRE" → va en notes como "Vendedor: ..."
- "Observaciones: ..." → si no está vacío, agregalo a notes
- "Entrega: Retira" / "Entrega: Envio" etc → va en notes como "Entrega: ..."
- "TOTAL N" (al pie, número grande) → total

Este tipo de documento NO tiene CAE, CUIT, IVA desglosado ni subtotal — dejá esos campos en null. No hay campo de proveedor identificable, dejá "supplier" en null y volcá todo el contexto (Cliente/Vendedor/Entrega) en "notes".

## Respondé ÚNICAMENTE con JSON válido (sin markdown):
{
  "invoice_number": "P-0004-00026254",
  "invoice_type": "Pedido",
  "supplier": null,
  "supplier_cuit": null,
  "invoice_date": "2026-07-27",
  "cae": null,
  "cae_expiry": null,
  "subtotal": null,
  "iva_amount": null,
  "total": 1840392.68,
  "total_units": 235,
  "item_count": 41,
  "notes": "Cliente: R6231-SANTIAGO MEDINA (R); Vendedor: 12-CHRISTIAN; Entrega: Retira",
  "lines": [
    {
      "description": "51000-RTO MACH 3 TURBO - X 4 (X PACK)",
      "sku": "51000",
      "ean": null,
      "name": "RTO MACH 3 TURBO - X 4 (X PACK)",
      "marca": "RTO",
      "quantity": 12,
      "unit_price": 9516.00
    }
  ]
}

## Reglas estrictas
1. Incluí TODOS los productos, uniendo líneas de descripción que envuelven en dos renglones
2. quantity: el entero antes de "x". unit_price: el primer precio de la línea (con punto decimal)
3. sku: siempre el código numérico después de "N)". name: la descripción sin el código ni la cantidad
4. item_count: cantidad total de ítems numerados que contaste
5. total_units e invoice_date/total: tomalos del pie del documento
6. Si un campo no aparece, usá null
7. NO inventes productos que no estén en el documento
8. NO omitas líneas aunque el documento sea largo`;

type RawParsed = {
  invoice_number?: string;
  invoice_type?: string | null;
  supplier?: string | null;
  supplier_cuit?: string | null;
  invoice_date?: string | null;
  cae?: string | null;
  cae_expiry?: string | null;
  subtotal?: number | string | null;
  iva_amount?: number | string | null;
  total?: number | string | null;
  total_units?: number | string | null;
  item_count?: number | string | null;
  notes?: string | null;
  lines?: Array<{
    description?: string | null;
    name?: string | null;
    sku?: string | null;
    ean?: string | null;
    marca?: string | null;
    quantity?: number | string | null;
    unit_price?: number | string | null;
  }>;
};

export function parseClaudeJson(text: string): ParsedInvoiceData {
  const cleaned = text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("No se pudo interpretar la respuesta de Claude");
  }

  const parsed = JSON.parse(cleaned.slice(start, end + 1)) as RawParsed;

  const lines: InvoiceLineInput[] = (parsed.lines ?? [])
    .map((l) =>
      normalizeInvoiceLine({
        name: l.name ?? "",
        description: l.description ?? l.name ?? "",
        sku: l.sku,
        ean: l.ean,
        marca: l.marca,
        quantity: l.quantity,
        unit_price: l.unit_price,
      })
    )
    .filter((l): l is NonNullable<typeof l> => l !== null);

  if (lines.length === 0) {
    throw new Error("No se detectaron productos en la factura");
  }

  const itemCount = parsed.item_count
    ? parseInt(String(parsed.item_count), 10)
    : undefined;

  if (itemCount && lines.length < itemCount) {
    console.warn(
      `Advertencia: se detectaron ${lines.length} ítems pero la factura indica ${itemCount}`
    );
  }

  return {
    invoice_number: parsed.invoice_number?.trim() || "SIN-NUMERO",
    invoice_type: parsed.invoice_type?.trim() || undefined,
    invoice_date: normalizeDate(parsed.invoice_date),
    supplier: parsed.supplier?.trim() || undefined,
    supplier_cuit: parsed.supplier_cuit?.trim() || undefined,
    cae: parsed.cae?.trim() || undefined,
    cae_expiry: normalizeDate(parsed.cae_expiry),
    subtotal: parseArgentineNumber(parsed.subtotal),
    iva_amount: parseArgentineNumber(parsed.iva_amount),
    total: parseArgentineNumber(parsed.total),
    total_units: parsed.total_units
      ? parseInt(String(parsed.total_units), 10)
      : undefined,
    item_count: itemCount,
    notes: parsed.notes?.trim() || undefined,
    lines,
  };
}

function normalizeDate(value: string | null | undefined): string | undefined {
  if (!value?.trim()) return undefined;

  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);

  // DD/MM/YY or DD/MM/YYYY
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (match) {
    const day = match[1].padStart(2, "0");
    const month = match[2].padStart(2, "0");
    let year = match[3];
    if (year.length === 2) year = `20${year}`;
    return `${year}-${month}-${day}`;
  }

  return undefined;
}

export type InvoiceDocType = "doan" | "pedido";

export async function extractInvoiceFromDocument(
  base64: string,
  mediaType: string,
  docType: InvoiceDocType = "doan"
): Promise<ParsedInvoiceData> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Falta ANTHROPIC_API_KEY en .env. Agregá tu API key de Anthropic."
    );
  }

  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey });

  const isPdf = mediaType === "application/pdf";
  const isImage = mediaType.startsWith("image/");

  if (!isPdf && !isImage) {
    throw new Error("Formato no soportado. Usá PDF o imagen (JPG, PNG, WebP).");
  }

  const documentContent = isPdf
    ? {
        type: "document" as const,
        source: {
          type: "base64" as const,
          media_type: "application/pdf" as const,
          data: base64,
        },
      }
    : {
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: mediaType as
            | "image/jpeg"
            | "image/png"
            | "image/gif"
            | "image/webp",
          data: base64,
        },
      };

  const model =
    process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-6";

  const prompt =
    docType === "pedido" ? PEDIDO_EXTRACTION_PROMPT : EXTRACTION_PROMPT;

  const response = await client.messages.create({
    model,
    max_tokens: 16384,
    messages: [
      {
        role: "user",
        content: [documentContent, { type: "text", text: prompt }],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude no devolvió una respuesta válida");
  }

  if (response.stop_reason === "max_tokens") {
    throw new Error(
      "La factura tiene demasiados ítems. Intentá de nuevo o contactá soporte."
    );
  }

  return parseClaudeJson(textBlock.text);
}
