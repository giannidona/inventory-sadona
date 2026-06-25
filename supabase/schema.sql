create table inventory (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sku text unique not null,
  ean text,
  stock int not null default 0,
  marca text,
  unit_price numeric(12, 2),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table stock_movements (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid references inventory(id) on delete cascade,
  delta int not null,
  reason text,
  created_at timestamptz default now()
);

-- Enable RLS and allow anon read on inventory (writes go through service role)
alter table inventory enable row level security;
alter table stock_movements enable row level security;

create policy "Allow anon read on inventory"
  on inventory for select
  to anon
  using (true);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null,
  invoice_type text,
  invoice_date date,
  supplier text,
  supplier_cuit text,
  cae text,
  cae_expiry date,
  file_path text,
  file_name text,
  subtotal numeric(12, 2),
  iva_amount numeric(12, 2),
  total numeric(12, 2),
  total_units int,
  item_count int,
  notes text,
  created_at timestamptz default now()
);

create table invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references invoices(id) on delete cascade not null,
  inventory_id uuid references inventory(id) on delete set null,
  product_name text not null,
  sku text,
  quantity int not null,
  unit_price numeric(12, 2),
  created_at timestamptz default now()
);

alter table invoices enable row level security;
alter table invoice_items enable row level security;

create policy "Allow anon read on invoices"
  on invoices for select to anon using (true);

create policy "Allow anon read on invoice_items"
  on invoice_items for select to anon using (true);

-- Migration for existing databases:
-- alter table inventory drop column if exists category;
-- alter table inventory drop column if exists notes;
-- alter table inventory add column if not exists marca text;
