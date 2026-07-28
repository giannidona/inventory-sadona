// Sets the EAN of each product in `inventory` based on a CSV with SKU/EAN
// columns (e.g. a full supplier catalog export).
//
// Usage:
//   node scripts/set-eans-from-csv.mjs <ruta-al-csv>            (dry run, no escribe nada)
//   node scripts/set-eans-from-csv.mjs <ruta-al-csv> --apply    (aplica los cambios)
//
// The CSV must have a header row with "EAN" and "SKU" columns (any order).
// Only products whose SKU already exists in `inventory` are touched; rows
// with SKUs not present in the inventory are reported and skipped.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const envPath = resolve(__dirname, "../.env");
  return Object.fromEntries(
    readFileSync(envPath, "utf8")
      .split("\n")
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i), l.slice(i + 1)];
      })
  );
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const eanIdx = header.indexOf("ean");
  const skuIdx = header.indexOf("sku");
  if (eanIdx === -1 || skuIdx === -1) {
    throw new Error('El CSV debe tener columnas "EAN" y "SKU" en el encabezado.');
  }

  return lines
    .slice(1)
    .map((line) => {
      const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
      return { ean: cols[eanIdx] ?? "", sku: cols[skuIdx] ?? "" };
    })
    .filter((row) => row.sku && row.ean);
}

async function fetchAllInventory(supabase) {
  const bySku = new Map();
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("inventory")
      .select("id, sku, ean")
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`Error leyendo inventario: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const item of data) bySku.set(item.sku, item);
    if (data.length < pageSize) break;
  }

  return bySku;
}

async function runWithConcurrency(items, limit, worker) {
  let index = 0;
  async function next() {
    while (index < items.length) {
      const current = items[index++];
      await worker(current);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, next)
  );
}

async function main() {
  const csvArg = process.argv[2];
  const apply = process.argv.includes("--apply");

  if (!csvArg) {
    console.error("Uso: node scripts/set-eans-from-csv.mjs <ruta-al-csv> [--apply]");
    process.exit(1);
  }

  const csvPath = resolve(process.cwd(), csvArg);
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env");
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`Leyendo ${csvPath}...`);
  const rows = parseCsv(readFileSync(csvPath, "utf8"));
  console.log(`${rows.length} filas con SKU y EAN en el CSV.`);

  console.log("Descargando inventario actual...");
  const bySku = await fetchAllInventory(supabase);
  console.log(`${bySku.size} productos en el inventario.\n`);

  const toUpdate = [];
  const seenSku = new Set();
  let alreadyOk = 0;
  let noMatch = 0;
  let duplicateSkuInCsv = 0;

  for (const row of rows) {
    if (seenSku.has(row.sku)) {
      duplicateSkuInCsv++;
      continue;
    }
    seenSku.add(row.sku);

    const product = bySku.get(row.sku);
    if (!product) {
      noMatch++;
      continue;
    }
    if (product.ean === row.ean) {
      alreadyOk++;
      continue;
    }
    toUpdate.push({ id: product.id, sku: row.sku, ean: row.ean });
  }

  console.log(`Para actualizar:        ${toUpdate.length}`);
  console.log(`Ya tenían ese EAN:      ${alreadyOk}`);
  console.log(`SKU no está en stock:   ${noMatch}`);
  if (duplicateSkuInCsv) {
    console.log(`SKU repetido en CSV:    ${duplicateSkuInCsv} (se usó la primera aparición)`);
  }

  if (toUpdate.length === 0) {
    console.log("\nNada para actualizar.");
    return;
  }

  if (!apply) {
    console.log("\n(dry run — no se escribió nada. Ejemplo de lo que cambiaría:)");
    for (const item of toUpdate.slice(0, 10)) {
      const before = bySku.get(item.sku)?.ean || "—";
      console.log(`  SKU ${item.sku}: "${before}" -> "${item.ean}"`);
    }
    if (toUpdate.length > 10) console.log(`  ... y ${toUpdate.length - 10} más`);
    console.log("\nCorré de nuevo con --apply para aplicar los cambios.");
    return;
  }

  console.log(`\nActualizando ${toUpdate.length} productos...`);
  let done = 0;
  let failed = 0;

  await runWithConcurrency(toUpdate, 10, async (item) => {
    const { error } = await supabase
      .from("inventory")
      .update({ ean: item.ean, updated_at: new Date().toISOString() })
      .eq("id", item.id);

    if (error) {
      failed++;
      console.error(`  Error en SKU ${item.sku}: ${error.message}`);
    } else {
      done++;
    }
  });

  console.log(`\nListo: ${done} actualizados, ${failed} con error.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
