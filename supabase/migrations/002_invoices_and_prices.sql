-- Add unit_price to inventory
alter table inventory add column if not exists unit_price numeric(12, 2);

-- Invoices table
create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null,
  supplier text,
  file_path text,
  file_name text,
  total numeric(12, 2),
  notes text,
  created_at timestamptz default now()
);

-- Invoice line items
create table if not exists invoice_items (
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

-- Storage bucket for invoice files (run in Supabase dashboard if needed):
-- insert into storage.buckets (id, name, public) values ('invoices', 'invoices', false);
