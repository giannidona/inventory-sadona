create table inventory (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sku text unique not null,
  ean text,
  stock int not null default 0,
  marca text,
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

-- Migration for existing databases:
-- alter table inventory drop column if exists category;
-- alter table inventory drop column if exists notes;
-- alter table inventory add column if not exists marca text;
