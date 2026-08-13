-- Flags stock_arrivals rows that came from creating a brand-new product
-- (vs. restocking one that already existed), so /new-products can show
-- just those without a separate table.
alter table stock_arrivals add column if not exists is_new boolean not null default false;

create index if not exists stock_arrivals_is_new_idx
  on stock_arrivals (is_new);
