export function parseArgentineNumber(value: string | number | null | undefined): number | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value === "number") return value;

  const cleaned = value
    .trim()
    .replace(/\$/g, "")
    .replace(/\s/g, "")
    .replace(/Unid\.?/gi, "");

  if (!cleaned) return undefined;

  // Argentine format: 1.234,56 → 1234.56
  if (cleaned.includes(",")) {
    const normalized = cleaned.replace(/\./g, "").replace(",", ".");
    const num = parseFloat(normalized);
    return isNaN(num) ? undefined : num;
  }

  const num = parseFloat(cleaned.replace(/\./g, ""));
  return isNaN(num) ? undefined : num;
}

/** Parses wholesale qty like "4,000 Unid" → 4 */
export function parseArgentineQuantity(value: string | number | null | undefined): number {
  if (typeof value === "number") return Math.round(value);
  if (!value) return 0;

  const cleaned = value.trim().replace(/Unid\.?/gi, "").trim();

  // "4,000" or "12,000" = whole units with 3 decimal places shown
  const wholeMatch = cleaned.match(/^(\d+),0{1,3}$/);
  if (wholeMatch) return parseInt(wholeMatch[1], 10);

  const num = parseArgentineNumber(cleaned);
  return num != null ? Math.round(num) : 0;
}

/**
 * Splits doan-style "CODIGO-NOMBRE" descriptions, e.g.:
 *   "23993-ESTRELLA ALGODON CLASICO x75Grs" (SKU interno, 4-6 dígitos)
 *   "7798140259435-ASEPXIA CARBON GEL EXFO x120" (EAN/código de barras, 8+ dígitos)
 *
 * Las facturas más nuevas del mayorista ya no traen el SKU interno, solo el
 * EAN del producto — por eso el código se clasifica según su longitud.
 */
export function splitProductDescription(description: string): {
  sku?: string;
  ean?: string;
  name: string;
  marca?: string;
} {
  const trimmed = description.trim();
  const match = trimmed.match(/^(\d{4,14})-(.+)$/);
  if (!match) return { name: trimmed };

  const code = match[1];
  const name = match[2].trim();
  const marca = extractBrandFromName(name);

  // 4-6 dígitos: código interno del mayorista (SKU). 8+ dígitos: EAN-13/UPC-A.
  if (code.length >= 8) {
    return { ean: code, name, marca };
  }
  return { sku: code, name, marca };
}

function extractBrandFromName(name: string): string | undefined {
  const first = name.split(/\s+/)[0];
  if (!first || first.length < 2) return undefined;
  // Skip size/quantity tokens
  if (/^x\d/i.test(first)) return undefined;
  return first;
}

export function normalizeInvoiceLine(line: {
  name: string;
  sku?: string | null;
  ean?: string | null;
  marca?: string | null;
  quantity?: number | string | null;
  unit_price?: number | string | null;
  description?: string | null;
}): {
  name: string;
  sku?: string;
  ean?: string;
  marca?: string;
  quantity: number;
  unit_price?: number;
} | null {
  let name = line.name?.trim() || line.description?.trim() || "";
  let sku = line.sku?.trim() || undefined;
  let ean = line.ean?.trim() || undefined;
  let marca = line.marca?.trim() || undefined;

  if (!name && line.description) {
    const split = splitProductDescription(line.description);
    name = split.name;
    sku = sku || split.sku;
    ean = ean || split.ean;
    marca = marca || split.marca;
  } else if (/^\d{4,14}-/.test(name)) {
    const split = splitProductDescription(name);
    name = split.name;
    sku = sku || split.sku;
    ean = ean || split.ean;
    marca = marca || split.marca;
  }

  const quantity = parseArgentineQuantity(line.quantity ?? 0);
  const unit_price = parseArgentineNumber(line.unit_price ?? undefined);

  if (!name || quantity <= 0) return null;

  return {
    name,
    sku,
    ean,
    marca: marca || extractBrandFromName(name),
    quantity,
    unit_price,
  };
}

export const IVA_RATE = 0.21;

export function calculateInvestmentWithIva(
  unitPrice: number | null | undefined,
  stock: number
): number | null {
  if (unitPrice == null) return null;
  return unitPrice * stock * (1 + IVA_RATE);
}

export function formatPrice(price: number | null | undefined): string {
  if (price == null) return "—";
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  }).format(price);
}

export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

export function generateSku(name: string): string {
  const base = slugify(name) || "PROD";
  const suffix = Date.now().toString(36).slice(-4).toUpperCase();
  return `${base}-${suffix}`;
}

export function parseCsvLines(text: string): Array<{
  name: string;
  sku?: string;
  ean?: string;
  marca?: string;
  quantity: number;
  unit_price?: number;
}> {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];

  const header = lines[0].toLowerCase();
  const hasHeader =
    header.includes("nombre") ||
    header.includes("name") ||
    header.includes("sku");

  const dataLines = hasHeader ? lines.slice(1) : lines;

  return dataLines
    .map((line) => {
      const cols = line.split(/[,;\t]/).map((c) => c.trim().replace(/^"|"$/g, ""));
      if (cols.length < 2) return null;

      const [col0, col1, col2, col3, col4, col5] = cols;

      if (hasHeader) {
        const parts = lines[0].split(/[,;\t]/).map((c) => c.trim().toLowerCase());
        const get = (keys: string[]) => {
          const idx = parts.findIndex((p) => keys.some((k) => p.includes(k)));
          return idx >= 0 ? cols[idx] : undefined;
        };
        const name = get(["nombre", "name", "producto"]) ?? col0;
        const sku = get(["sku", "codigo"]);
        const ean = get(["ean", "barcode", "codigo_barras"]);
        const marca = get(["marca", "brand"]);
        const qtyStr = get(["cantidad", "qty", "quantity", "stock"]) ?? col2;
        const priceStr = get(["precio", "price", "unit_price", "costo"]);

        const quantity = parseInt(qtyStr ?? "0", 10);
        const unit_price = priceStr ? parseFloat(priceStr.replace(",", ".")) : undefined;

        if (!name || isNaN(quantity) || quantity <= 0) return null;
        return { name, sku, ean, marca, quantity, unit_price };
      }

      const quantity = parseInt(col2 ?? "0", 10);
      const unit_price = col3 ? parseFloat(col3.replace(",", ".")) : undefined;
      if (!col0 || isNaN(quantity) || quantity <= 0) return null;

      return {
        name: col0,
        sku: col1 || undefined,
        quantity,
        unit_price,
        ean: col4 || undefined,
        marca: col5 || undefined,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
}
