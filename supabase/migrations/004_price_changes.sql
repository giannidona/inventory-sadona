-- Tracks price changes detected when an invoice updates a product that
-- already had a different unit_price, so old vs new price can be reviewed.
create table price_changes (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references invoices(id) on delete set null,
  inventory_id uuid references inventory(id) on delete cascade,
  product_name text not null,
  sku text,
  old_price numeric(12, 2) not null,
  new_price numeric(12, 2) not null,
  created_at timestamptz default now()
);

alter table price_changes enable row level security;

create policy "Allow anon read on price_changes"
  on price_changes for select
  to anon
  using (true);

create index if not exists price_changes_inventory_id_idx
  on price_changes (inventory_id);

create index if not exists price_changes_created_at_idx
  on price_changes (created_at desc);
