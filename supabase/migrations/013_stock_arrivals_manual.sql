-- Ingresos manuales (API / WhatsApp): una compra que no viene de una factura cargada.
--  * old_price: precio anterior guardado directamente en el ingreso (las facturas lo seguían
--    sacando de price_changes por invoice_id+inventory_id, que no existe en ingresos manuales)
--  * supplier : dónde se compró (en facturas sale del invoice; en manuales se guarda acá)
--  * source   : 'invoice' (por defecto) o 'manual'
alter table stock_arrivals add column if not exists old_price numeric(12, 2);
alter table stock_arrivals add column if not exists supplier text;
alter table stock_arrivals add column if not exists source text not null default 'invoice';
