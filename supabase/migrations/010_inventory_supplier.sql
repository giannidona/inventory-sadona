-- Tracks where a product was last bought from (Doan, QPoint, etc.), taken
-- from the supplier of whichever invoice most recently restocked it — kept
-- up to date automatically by processInvoice(), and editable by hand for
-- older products or manual corrections.
alter table inventory add column if not exists supplier text;
