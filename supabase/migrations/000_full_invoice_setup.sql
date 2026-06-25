-- ============================================================
-- SADONA Inventory — migración completa de facturas
-- Pegá todo esto en Supabase → SQL Editor → Run
-- Es seguro ejecutarlo aunque algunas cosas ya existan.
-- ============================================================

-- 1. Precio en productos
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS unit_price numeric(12, 2);

-- 2. Tabla de facturas
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL,
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
  created_at timestamptz DEFAULT now()
);

-- 3. Columnas fiscales (por si la tabla ya existía con versión vieja)
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_type text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_date date;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS supplier_cuit text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS cae text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS cae_expiry date;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS subtotal numeric(12, 2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS iva_amount numeric(12, 2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS total_units int;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS item_count int;

-- 4. Ítems de cada factura
CREATE TABLE IF NOT EXISTS invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  inventory_id uuid REFERENCES inventory(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  sku text,
  quantity int NOT NULL,
  unit_price numeric(12, 2),
  created_at timestamptz DEFAULT now()
);

-- 5. Evitar procesar la misma factura dos veces (por CAE)
CREATE UNIQUE INDEX IF NOT EXISTS invoices_cae_unique ON invoices (cae) WHERE cae IS NOT NULL;

-- 6. Seguridad (RLS)
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon read on invoices" ON invoices;
CREATE POLICY "Allow anon read on invoices"
  ON invoices FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Allow anon read on invoice_items" ON invoice_items;
CREATE POLICY "Allow anon read on invoice_items"
  ON invoice_items FOR SELECT TO anon USING (true);

-- 7. Bucket para guardar los PDF de facturas
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoices', 'invoices', false)
ON CONFLICT (id) DO NOTHING;
