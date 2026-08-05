-- Tracks packages handed off to delivery couriers (cadeterías), scanned from
-- the QR on each Mercado Envíos label. One row per package/pack_id.
create table shipments (
  id uuid primary key default gen_random_uuid(),
  courier text not null check (courier in ('Express', 'FuneFlex')),
  pack_id text not null,
  shipment_date date not null,
  raw_qr text,
  created_at timestamptz default now()
);

alter table shipments enable row level security;

create policy "Allow anon read on shipments"
  on shipments for select
  to anon
  using (true);

create unique index if not exists shipments_pack_id_idx
  on shipments (pack_id);

create index if not exists shipments_shipment_date_idx
  on shipments (shipment_date);

create index if not exists shipments_courier_idx
  on shipments (courier);
