-- Backfill inventory.supplier for products that already existed before
-- this field was added. For each product, looks at its most recent
-- invoice_items row (by fecha) and copies that invoice's supplier — the
-- exact same rule processInvoice() now applies automatically going
-- forward. Only touches products where supplier is still null, so it's
-- safe to re-run and won't overwrite anything you've set by hand.
-- Pegar tal cual en el SQL Editor de Supabase.

update inventory inv
set supplier = last_invoice.supplier
from (
  select distinct on (ii.inventory_id)
    ii.inventory_id,
    i.supplier
  from invoice_items ii
  join invoices i on i.id = ii.invoice_id
  where ii.inventory_id is not null
    and i.supplier is not null
  order by ii.inventory_id, ii.created_at desc
) as last_invoice
where inv.id = last_invoice.inventory_id
  and inv.supplier is null;
