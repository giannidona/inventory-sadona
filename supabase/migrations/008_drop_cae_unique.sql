-- Dai Nippon (and possibly other suppliers) issue a CAEA, not a CAE — a
-- code requested in advance for a whole batch of invoices, so it repeats
-- identically across many real, distinct invoices. A unique index on cae
-- is incompatible with that and blocks legitimate invoices from saving
-- ("duplicate key value violates unique constraint invoices_cae_unique").
--
-- Duplicate detection now happens at the app level instead, based on
-- invoice_number (+ supplier when known) — see app/actions/invoices.ts.
drop index if exists invoices_cae_unique;
