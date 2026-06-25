-- Add fiscal metadata to invoices (Argentine format)
alter table invoices add column if not exists invoice_type text;
alter table invoices add column if not exists invoice_date date;
alter table invoices add column if not exists cae text;
alter table invoices add column if not exists cae_expiry date;
alter table invoices add column if not exists supplier_cuit text;
alter table invoices add column if not exists subtotal numeric(12, 2);
alter table invoices add column if not exists iva_amount numeric(12, 2);
alter table invoices add column if not exists total_units int;
alter table invoices add column if not exists item_count int;

create unique index if not exists invoices_cae_unique on invoices (cae) where cae is not null;
