-- API de escritura (crear / editar / ajustar stock / eliminar productos).
--
-- 1) Nuevo scope 'write' para api_keys (incluye todo lo de 'private').
--    Una key 'private' NO puede escribir: hay que darle el scope 'write' a propósito
--    (node --env-file=.env scripts/api-key.mjs scope <id> write).
-- 2) api_audit_log: registro de cada escritura hecha por la API, con el estado
--    ANTES y DESPUÉS del producto. Si se borra algo por error, acá queda el
--    snapshot completo para poder recuperarlo.

alter table api_keys drop constraint if exists api_keys_scope_check;
alter table api_keys
  add constraint api_keys_scope_check check (scope in ('public', 'private', 'write'));

create table if not exists api_audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  api_key_id uuid,
  api_key_name text,
  action text not null,            -- create | update | stock | delete
  product_id uuid,                 -- sin FK a propósito: sobrevive al borrado del producto
  product_ean text,
  before jsonb,
  after jsonb
);

create index if not exists api_audit_log_created_idx on api_audit_log (created_at desc);
create index if not exists api_audit_log_product_idx on api_audit_log (product_id);

-- Sin policies: solo accesible desde el servidor (service role), nunca por la API anon.
alter table api_audit_log enable row level security;
