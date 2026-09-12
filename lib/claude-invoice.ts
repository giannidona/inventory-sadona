import {
  IVA_RATE,
  normalizeInvoiceLine,
  parseArgentineNumber,
  type InvoiceDocType,
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
- DESCRIPCION: "CODIGO-NOMBRE" (ej: "100054-**FLETE CAPITAL", código corto de 4 a 6 dígitos)
- CANTIDAD viene como "4,000 Unid" = 4 unidades (la coma y los ceros son decimales de presentación, NO miles)
- P.UNIT. = precio unitario por unidad, se usa directo

**Formato B**, más nuevo (columnas: DESCRIPCION | P.LISTA | DTO | P.UNIT | UNIDAD | IVA | IMPORTE):
- DESCRIPCION: "CODIGO-NOMBRE" (código largo, 8+ dígitos, tipo EAN-13/UPC-A)
- UNIDAD viene como número entero simple (ej: "6", "12", "24"), sin ", Unid" — es la cantidad
- P.LISTA es el precio de lista SIN descuento — IGNORALO
- P.UNIT es el precio YA con el descuento (DTO) aplicado — ese es el que va en unit_price

## Cómo clasificar el código antes del guión en DESCRIPCION — IMPORTANTE
Este código (sea corto como "100054" o largo como "7798140259435") es SIEMPRE el
código de producto propio del mayorista (lo tratamos como "ean"), nunca el SKU
interno de Sadona — este ya no aparece en ninguna factura del mayorista, sin
importar cuántos dígitos tenga el código.
- Poné el código completo en el campo "ean"
- Dejá "sku" SIEMPRE en null (no importa la longitud del código)
Si una línea no tiene código-guión antes del nombre (raro, pero puede pasar,
ej: "**FLETE CAPITAL" en algunas facturas), dejá tanto "sku" como "ean" en null.

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
      "description": "100054-**FLETE CAPITAL",
      "sku": null,
      "ean": "100054",
      "name": "**FLETE CAPITAL",
      "marca": null,
      "quantity": 1,
      "unit_price": 8181.82
    },
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
4. Código antes del guión en DESCRIPCION: SIEMPRE va en "ean", sin importar la longitud. "sku" queda SIEMPRE en null — el mayorista no manda el SKU interno de Sadona
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

const NIPPON_EXTRACTION_PROMPT = `Sos un extractor de facturas de la distribuidora "Dai Nippon S.A.", un mayorista de cosmética con un formato de factura particular.

IMPORTANTE — PÁGINAS DUPLICADAS: Estas facturas casi siempre traen la MISMA factura impresa dos veces en el mismo PDF (una copia "Original" y otra "Duplicado", idénticas letra por letra, cada una ocupando 1 o 2 páginas). Fijate si el número de factura, el CAE/CAEA y los productos de una página coinciden exactamente con los de una página anterior — si es así, es una copia duplicada: NO la vuelvas a contar. Extraé la tabla de productos UNA SOLA VEZ, de la primera copia legible del documento.

## Encabezado
- Proveedor: "Dai Nippon S.A."
- Número de factura: aparece junto a "FACTURA", algo como "0015-00699013" (formato XXXX-XXXXXXXX)
- Tipo de factura: la letra grande en un recuadro (A, B, etc.)
- CUIT del proveedor: al lado de "CUIT:"
- Fecha: al lado de "FECHA:", formato DD/MM/YYYY
- CAE: aparece como "CAEA" seguido de un número largo (ej: "CAEA 86305546115375") — usalo como "cae"
- Vencimiento CAE: al lado de "Fecha de Vto." (formato DD/MM/YY) — usalo como "cae_expiry"

## Tabla de productos (columnas: CODIGO | CANTIDAD | DESCRIPCION | EAN13 | P.UNIT.S/IVA | DESCUENTOS | TOTAL)
La línea cruda se ve así (columnas separadas por espacios, sin ningún separador visual entre CANTIDAD, el empaque y DESCRIPCION):

  337060351   3   1x1   IDI LAB.BARRA ULTRA HD 251-SIENA   77960498   5358,47   16075,42
  ↑CODIGO     ↑CANT ↑empaque  ↑DESCRIPCION (nombre real)              ↑EAN13    ↑P.UNIT.S/IVA

- CODIGO (primer número de la línea, ej "337060351"): IGNORALO POR COMPLETO. NUNCA lo pongas en "sku" ni en ningún otro campo. No es el SKU de Sadona. El campo "sku" del JSON queda SIEMPRE en null, sin excepción — aunque te "parezca" un código de producto válido, no lo es acá.
- EAN13 (el número que aparece DESPUÉS de la descripción, justo antes del precio, ej "77960498"): es el ÚNICO código de producto que importa. Va siempre en el campo "ean" (a veces tiene menos de 13 dígitos, igual usalo tal cual aparece)
- DESCRIPCION: el texto entre el empaque (1x1/UNI/etc) y el EAN13. Va al campo "name" — SIN el empaque pegado adelante (ver sección siguiente)
- P.UNIT.S/IVA: precio unitario, YA SIN IVA — usalo directo en "unit_price", no hace falta convertir ni restar nada
- Hay una línea "FLETE" al final de la tabla con 0,00 en todo — IGNORALA, no es un producto

## CANTIDAD y empaque — ojo, esto requiere un cálculo Y una limpieza de texto
Entre CANTIDAD y DESCRIPCION hay un tercer valor pegado, el "empaque" ("UNI", "1x1", "1x6", etc). Este empaque:
1. Se usa para calcular la cantidad real (ver fórmula abajo)
2. NO ES PARTE DEL NOMBRE DEL PRODUCTO — nunca lo incluyas en "name" ni en "description". El nombre empieza en la palabra siguiente al empaque.

Cálculo de cantidad real = CANTIDAD × multiplicador del empaque:
- "UNI" → sin multiplicador, la cantidad real es CANTIDAD tal cual
- "AxB" (ej: "1x1", "1x6") → multiplicá CANTIDAD × A × B

Ejemplo completo con la línea de arriba ("337060351   3   1x1   IDI LAB.BARRA ULTRA HD 251-SIENA   77960498   5358,47   16075,42"):
- sku: null (el 337060351 NUNCA va acá)
- ean: "77960498"
- quantity: 3 × 1 × 1 = 3
- name: "IDI LAB.BARRA ULTRA HD 251-SIENA"  ← CORRECTO, sin "1x1" adelante
- name INCORRECTO (no hagas esto): "1x1 IDI LAB.BARRA ULTRA HD 251-SIENA"  ← el empaque quedó pegado, está mal

Más ejemplos de cálculo de cantidad:
- "1   1x6   RISQUE ESM. DESEJO" → cantidad real = 1 × 1 × 6 = 6, name = "RISQUE ESM. DESEJO"
- "4   UNI   RISQUE ESM. CARMIM" → cantidad real = 4 (sin multiplicador), name = "RISQUE ESM. CARMIM"

El campo "quantity" del JSON tiene que ser SIEMPRE el resultado YA MULTIPLICADO (el entero final que va a stock), nunca el número crudo de la columna CANTIDAD. Para verificar que el cálculo está bien: quantity × unit_price tiene que dar aproximadamente el valor de la columna TOTAL de esa línea.

## Totales (pie de factura)
- subtotal = "SubTotal" / "SUB-TOTAL"
- iva_amount = el monto que se suma al subtotal para llegar al total (en esta factura aparece como "P.Iva RG5329 21% <monto>", el nombre puede variar)
- total = el TOTAL final (subtotal + iva_amount)
- Esta factura no siempre trae total de unidades ni cantidad de ítems explícitos — si no aparecen, dejá total_units e item_count en null

## Respondé ÚNICAMENTE con JSON válido (sin markdown):
{
  "invoice_number": "0015-00699013",
  "invoice_type": "A",
  "supplier": "Dai Nippon S.A.",
  "supplier_cuit": "30644206463",
  "invoice_date": "2026-08-11",
  "cae": "86305546115375",
  "cae_expiry": "2026-08-15",
  "subtotal": 411560.72,
  "iva_amount": 86427.75,
  "total": 497988.47,
  "total_units": null,
  "item_count": null,
  "notes": null,
  "lines": [
    {
      "description": "IDI LAB.BARRA ULTRA HD 251-SIENA",
      "sku": null,
      "ean": "77960498",
      "name": "IDI LAB.BARRA ULTRA HD 251-SIENA",
      "marca": "IDI",
      "quantity": 3,
      "unit_price": 5358.47
    },
    {
      "description": "RISQUE ESM. DESEJO",
      "sku": null,
      "ean": "7891182030915",
      "name": "RISQUE ESM. DESEJO",
      "marca": "RISQUE",
      "quantity": 6,
      "unit_price": 1713.42
    }
  ]
}

## Reglas estrictas
1. Incluí TODOS los productos, pero SOLO UNA VEZ cada uno — si la factura está duplicada en el PDF (copia Original + Duplicado), no repitas los productos
2. sku: SIEMPRE null, en las 34+ líneas de la factura, sin ninguna excepción. El CODIGO (primer número de cada línea) NUNCA va en "sku" ni en ningún campo
3. ean: SIEMPRE el valor de la columna EAN13 (el número que está justo antes del precio, no el CODIGO)
4. name: NUNCA debe empezar con "1x1", "UNI", "1x6" ni ningún otro texto de empaque — revisá cada nombre antes de responder y sacá ese prefijo si quedó pegado
5. quantity: el resultado de CANTIDAD × multiplicador de empaque (ver arriba), como número entero final
6. unit_price: la columna P.UNIT.S/IVA, tal cual (ya está sin IVA)
7. No incluyas la línea "FLETE" como producto
8. Si un campo no aparece, usá null
9. NO inventes productos que no estén en la factura`;

const GENERIC_EXTRACTION_PROMPT = `Sos un extractor universal de facturas y comprobantes de compra argentinos — el formato puede ser CUALQUIERA: factura A, B o C, de un mayorista o de un comercio minorista, ticket de farmacia, factura de venta web, etc. No asumas ningún layout fijo: fijate en el documento real que tenés adelante y adaptate.

IMPORTANTE: Si el documento tiene MÚLTIPLES PÁGINAS, leé TODAS y extraé TODOS los ítems de la tabla de productos. No omitas ninguna línea.

## Qué extraer del encabezado
- Proveedor: la Razón Social de quien EMITE la factura (busca "Razón Social:", "Emisor", o el nombre grande arriba de todo)
- CUIT del proveedor
- Número de factura/comprobante (Punto de Venta + Comp.Nro., o cualquier numeración que use el documento)
- Tipo de factura (A, B, C, ticket, etc.)
- Fecha de emisión
- CAE / CAEA y su vencimiento, si aparecen
- Subtotal, IVA y Total, si el documento los discrimina en el pie

## Tabla de productos
Cada línea trae normalmente: un código de producto (puede ser un EAN13 de barras, o un código interno corto del proveedor), nombre/descripción, cantidad y precio unitario (a veces también %descuento y subtotal de línea).
- Poné el código de producto SIEMPRE en el campo "ean" (sea el código que sea, corto o largo, EAN real o código interno) — nunca completes un "sku" separado, dejalo en null
- Si una línea no tiene código de producto y es un cargo de envío/flete (ej. "ENVIO A DOMICILIO", "FLETE") NO la incluyas como producto — no es mercadería
- name: copiá el texto tal cual está impreso en la factura, sin expandir abreviaturas ni "corregir" nada
- unit_price: el precio unitario TAL CUAL aparece impreso en esa línea — no le restes ni le sumes IVA vos, eso lo hace otro paso del sistema después

## Precios con IVA incluido o no — el campo más importante, pensalo bien
Fijate si el precio de cada línea YA INCLUYE el IVA o no:
- Es una venta MINORISTA / a "CONSUMIDOR FINAL" con precios finales de venta (señales: "Condición de IVA: CONSUMIDOR FINAL", o una leyenda tipo "REGIMEN DE TRANSPARENCIA FISCAL AL CONSUMIDOR" / "IVA contenido") → los precios de la tabla YA TIENEN el IVA adentro → "prices_include_iva": true
- Es una factura A, o una factura a un Responsable Inscripto con IVA discriminado aparte en el pie (SubTotal + IVA = Total, como líneas separadas, y los precios de la tabla coinciden con el SubTotal) → los precios de la tabla son netos, sin IVA → "prices_include_iva": false
Regla práctica si tenés dudas: sumá cantidad × precio de todas las líneas. Si ese total coincide con el Total final de la factura, los precios YA incluyen IVA (true). Si ese total coincide con el Subtotal (y hay que sumarle el IVA aparte para llegar al Total), los precios son netos (false).

## Respondé ÚNICAMENTE con JSON válido (sin markdown):
{
  "invoice_number": "0010-00292624",
  "invoice_type": "B",
  "supplier": "FARMACIA SIANO - SIANO SILVIA GRACIELA",
  "supplier_cuit": "27-17263320-5",
  "invoice_date": "2026-09-04",
  "cae": "86361568388096",
  "cae_expiry": "2026-09-14",
  "subtotal": 187656.01,
  "iva_amount": 32568.40,
  "total": 187656.01,
  "total_units": 15,
  "item_count": 6,
  "prices_include_iva": true,
  "notes": null,
  "lines": [
    {
      "ean": "7509552920932",
      "name": "FRUCTIS RIZOS PODE SH X350",
      "marca": "FRUCTIS",
      "quantity": 3,
      "unit_price": 6960.67
    }
  ]
}

## Reglas estrictas
1. Incluí TODOS los productos de TODAS las páginas — nunca omitas líneas
2. NO incluyas cargos de envío/flete como si fueran productos
3. ean: siempre el código de producto de la línea, sin importar el largo. sku: siempre null (lo completa el sistema después)
4. name: copiá el texto de la factura tal cual, sin expandir abreviaturas ni corregir nada
5. unit_price: el número crudo de la línea, sin restarle ni sumarle IVA vos — eso lo hace otro paso del sistema
6. prices_include_iva: true o false según la lógica de arriba
7. quantity: entero positivo
8. Si un campo no aparece en la factura, usá null
9. NO inventes productos ni datos que no estén en el documento`;

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
  // Only meaningful for docType "generic" — whether the line unit_price
  // values already include IVA (retail/consumer invoices) or not
  // (wholesale/Factura A with IVA discriminated separately).
  prices_include_iva?: boolean | null;
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

export function parseClaudeJson(
  text: string,
  docType: InvoiceDocType = "doan"
): ParsedInvoiceData {
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
      normalizeInvoiceLine(
        {
          name: l.name ?? "",
          description: l.description ?? l.name ?? "",
          sku: l.sku,
          ean: l.ean,
          marca: l.marca,
          quantity: l.quantity,
          unit_price: l.unit_price,
        },
        docType
      )
    )
    .filter((l): l is NonNullable<typeof l> => l !== null);

  if (lines.length === 0) {
    throw new Error("No se detectaron productos en la factura");
  }

  // Generic invoices can be either wholesale (net prices) or retail-to-
  // consumer (IVA-inclusive prices) — Claude only judges which case this is
  // (prices_include_iva); the actual division happens here in code rather
  // than trusting the model to do consistent arithmetic across every line.
  let normalizedLines = lines;
  if (docType === "generic" && parsed.prices_include_iva) {
    const subtotalNum = parseArgentineNumber(parsed.subtotal);
    const ivaNum = parseArgentineNumber(parsed.iva_amount);
    const totalNum = parseArgentineNumber(parsed.total);
    // Prefer total - iva_amount over the "subtotal" field: on invoices that
    // disclose tax-inclusive pricing (Régimen de Transparencia Fiscal al
    // Consumidor), "Subtotal" is often just a repeat of the final Total, not
    // the true pre-tax base — total - iva_amount always is, by definition.
    const base =
      totalNum != null && ivaNum != null ? totalNum - ivaNum : subtotalNum;
    const effectiveRate = base && base > 0 && ivaNum != null ? ivaNum / base : IVA_RATE;

    normalizedLines = lines.map((line) =>
      line.unit_price != null
        ? { ...line, unit_price: roundCurrency(line.unit_price / (1 + effectiveRate)) }
        : line
    );
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
    lines: normalizedLines,
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

export type { InvoiceDocType };

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
    docType === "pedido"
      ? PEDIDO_EXTRACTION_PROMPT
      : docType === "nippon"
        ? NIPPON_EXTRACTION_PROMPT
        : docType === "generic"
          ? GENERIC_EXTRACTION_PROMPT
          : EXTRACTION_PROMPT;

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

  const parsed = parseClaudeJson(textBlock.text, docType);

  // El precio unitario en los pedidos viene con IVA incluido; el resto de la
  // app (stock, inversión, price_changes) asume precio neto, así que lo
  // convertimos acá antes de devolver los datos.
  if (docType === "pedido") {
    parsed.lines = parsed.lines.map((line) =>
      line.unit_price != null
        ? { ...line, unit_price: roundCurrency(line.unit_price / (1 + IVA_RATE)) }
        : line
    );
  }

  return parsed;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}
