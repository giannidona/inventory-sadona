import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    })
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const migrationSql = readFileSync(
  resolve(__dirname, "../supabase/migrations/002_invoices_and_prices.sql"),
  "utf8"
);

async function runMigration() {
  const dbUrl = env.DATABASE_URL || env.SUPABASE_DB_URL;
  if (!dbUrl) return false;

  try {
    const { default: postgres } = await import("postgres");
    const sql = postgres(dbUrl, { max: 1 });
    await sql.unsafe(migrationSql);
    await sql.end();
    console.log("Migración aplicada correctamente.");
    return true;
  } catch (err) {
    console.warn("No se pudo aplicar migración automática:", err.message);
    return false;
  }
}

async function main() {
  console.log("Creating storage bucket 'invoices'...");
  const { error: bucketError } = await supabase.storage.createBucket("invoices", {
    public: false,
  });
  if (bucketError && !bucketError.message.includes("already exists")) {
    console.warn("Bucket:", bucketError.message);
  } else {
    console.log("Storage bucket ready.");
  }

  const { error: testError } = await supabase.from("invoices").select("id").limit(1);

  if (
    testError?.message.includes("does not exist") ||
    testError?.message.includes("schema cache") ||
    testError?.code === "42P01"
  ) {
    const migrated = await runMigration();
    if (!migrated) {
      console.log("\n⚠️  Las tablas de facturas no existen aún.");
      console.log("Opción 1: Agregá DATABASE_URL a .env y volvé a correr este script.");
      console.log("Opción 2: Ejecutá el SQL en Supabase → SQL Editor:");
      console.log("  supabase/migrations/002_invoices_and_prices.sql\n");
      process.exit(1);
    }
  } else if (testError) {
    console.error("Error checking tables:", testError.message);
    process.exit(1);
  }

  const { error: priceError } = await supabase
    .from("inventory")
    .select("unit_price")
    .limit(1);

  if (priceError?.message.includes("unit_price")) {
    const migrated = await runMigration();
    if (!migrated) {
      console.log("\n⚠️  Falta la columna unit_price en inventory.");
      console.log("Ejecutá la migración en Supabase → SQL Editor.\n");
      process.exit(1);
    }
  }

  console.log("Database schema OK.");
}

main().catch(console.error);
