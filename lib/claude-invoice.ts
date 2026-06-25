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
- Número de factura: formato XXXX-XXXXXXXX (ej: 0009-000071663)
- Fecha: DD/MM/YY
- Tabla con columnas: CANTIDAD | DESCRIPCION | P.UNIT. | IVA | IMPORTE
- DESCRIPCION formato: CODIGO-NOMBRE PRODUCTO (ej: "23993-ESTRELLA ALGODON CLASICO x75Grs")
  - El código numérico antes del guión es el SKU/código del producto
  - Lo que sigue al guión es el nombre del producto
  - La primera palabra del nombre suele ser la marca (ESTRELLA, TRESEMME, etc.)
- CANTIDAD formato: "4,000 Unid" = 4 unidades (la coma y los ceros son decimales de presentación, NO miles)
- Precios en formato argentino: coma decimal, punto miles (ej: "662,44" = 662.44, "397.284,44" = 397284.44)
- P.UNIT. = precio unitario por unidad
- Pie de factura: SubTotal, IVA, Importe Total, CAE, vencimiento CAE, TOTAL UNIDADES, cantidad de ítems

## Respondé ÚNICAMENTE con JSON válido (sin markdown):
{
  "invoice_number": "0009-000071663",
  "invoice_type": "A",
  "supplier": "CEMAFELU S.A.",
  "supplier_cuit": "30710164637",
  "invoice_date": "2026-06-02",
  "cae": "86228010177550",
  "cae_expiry": "2026-06-02",
  "subtotal": 397284.44,
  "iva_amount": 83429.73,
  "total": 480714.17,
  "total_units": 183,
  "item_count": 53,
  "notes": "observaciones del pie de factura o null",
  "lines": [
    {
      "description": "23993-ESTRELLA ALGODON CLASICO x75Grs",
      "sku": "23993",
      "name": "ESTRELLA ALGODON CLASICO x75Grs",
      "marca": "ESTRELLA",
      "quantity": 4,
      "unit_price": 662.44
    }
  ]
}

## Reglas estrictas
1. Incluí TODOS los productos de TODAS las páginas del PDF
2. quantity: entero positivo (4,000 Unid → 4, 12,000 Unid → 12, 1,000 Unid → 1)
3. unit_price: número decimal con punto (convertí de formato argentino)
4. sku: código numérico antes del guión en DESCRIPCION
5. name: texto después del guión, sin el código
6. item_count: cantidad total de líneas/ítems que indica la factura (ej: "Items: 53")
7. total_units: suma de unidades del pie (ej: "TOTAL UNIDADES: 183")
8. total/subtotal/iva_amount: del pie de factura, convertidos a número decimal
9. invoice_date y cae_expiry en formato ISO YYYY-MM-DD
10. Si un campo no aparece, usá null
11. NO inventes productos que no estén en la factura
12. NO omitas líneas aunque el PDF sea largo`;

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

export async function extractInvoiceFromDocument(
  base64: string,
  mediaType: string
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

  const response = await client.messages.create({
    model,
    max_tokens: 16384,
    messages: [
      {
        role: "user",
        content: [documentContent, { type: "text", text: EXTRACTION_PROMPT }],
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
