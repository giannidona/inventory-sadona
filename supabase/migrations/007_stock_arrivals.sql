-- Logs every line item received through an invoice (new or restocked
-- product), independent of price_changes, so stock received can be synced
-- to other sales channels (MercadoLibre, etc.) without reopening the
-- invoice each time.
create table stock_arrivals (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references invoices(id) on delete set null,
  inventory_id uuid references inventory(id) on delete cascade,
  product_name text not null,
  sku text,
  ean text,
  quantity_added int not null,
  new_stock int not null,
  unit_price numeric(12, 2),
  created_at timestamptz default now()
);

alter table stock_arrivals enable row level security;

create policy "Allow anon read on stock_arrivals"
  on stock_arrivals for select
  to anon
  using (true);

create index if not exists stock_arrivals_inventory_id_idx
  on stock_arrivals (inventory_id);

create index if not exists stock_arrivals_created_at_idx
  on stock_arrivals (created_at desc);
