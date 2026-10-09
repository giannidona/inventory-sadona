-- API keys para la API pública /api/v1.
-- Solo se guarda el HASH (sha256) de cada key — la key en sí se muestra una única vez al crearla.
-- scope:
--   'public'  -> web de SADONA (nombre, marca, stock, precio)
--   'private' -> Hermes / uso interno (además proveedor, movimientos, ingresos, estadísticas)
-- RLS activado SIN policies: la tabla no es accesible por la API anon de Supabase,
-- solo desde el servidor con la service role.

create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  scope text not null check (scope in ('public', 'private')),
  key_prefix text not null,
  key_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

alter table api_keys enable row level security;
