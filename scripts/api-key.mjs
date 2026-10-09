// Administra las API keys de /api/v1.
//
//   node --env-file=.env scripts/api-key.mjs create "Web SADONA" public
//   node --env-file=.env scripts/api-key.mjs create "Hermes" private
//   node --env-file=.env scripts/api-key.mjs create "Hermes (escritura)" write
//   node --env-file=.env scripts/api-key.mjs scope <id> write      (cambia el permiso de una key existente)
//   node --env-file=.env scripts/api-key.mjs list
//   node --env-file=.env scripts/api-key.mjs revoke <id>
//
// La key completa se muestra UNA sola vez al crearla; en la base solo queda su hash.
// Requiere haber corrido supabase/migrations/011_api_keys.sql.

import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (usá --env-file=.env).");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const [cmd, a, b] = process.argv.slice(2);

if (cmd === "create") {
  const name = a;
  const scope = b;
  if (!name || !["public", "private", "write"].includes(scope)) {
    console.error('Uso: create "<nombre>" <public|private|write>');
    process.exit(1);
  }
  const key = `sdn_${scope === "public" ? "pub" : scope === "write" ? "wrt" : "prv"}_${randomBytes(24).toString("base64url")}`;
  const { error } = await supabase.from("api_keys").insert({
    name,
    scope,
    key_prefix: key.slice(0, 12),
    key_hash: createHash("sha256").update(key).digest("hex"),
  });
  if (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
  console.log(`\nKey creada (${scope}) para "${name}". Guardala ahora, no se vuelve a mostrar:\n\n  ${key}\n`);
} else if (cmd === "list") {
  const { data, error } = await supabase
    .from("api_keys")
    .select("id, name, scope, key_prefix, created_at, last_used_at, revoked_at")
    .order("created_at");
  if (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
  console.table(
    data.map((k) => ({
      id: k.id,
      nombre: k.name,
      scope: k.scope,
      prefijo: k.key_prefix,
      ultimo_uso: k.last_used_at ?? "-",
      estado: k.revoked_at ? "REVOCADA" : "activa",
    }))
  );
} else if (cmd === "scope") {
  // Cambia el permiso de una key YA existente (la key en sí no cambia, no hay que copiar nada).
  if (!a || !["public", "private", "write"].includes(b)) {
    console.error("Uso: scope <id> <public|private|write>");
    process.exit(1);
  }
  const { data, error } = await supabase.from("api_keys").update({ scope: b }).eq("id", a).select("name").maybeSingle();
  if (error || !data) {
    console.error("Error:", error?.message ?? "No existe una key con ese id.");
    process.exit(1);
  }
  console.log(`La key "${data.name}" ahora tiene scope ${b}.`);
} else if (cmd === "revoke") {
  if (!a) {
    console.error("Uso: revoke <id>");
    process.exit(1);
  }
  const { error } = await supabase
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", a);
  if (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
  console.log("Key revocada.");
} else {
  console.error("Comandos: create | list | scope | revoke");
  process.exit(1);
}
