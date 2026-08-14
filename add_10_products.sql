-- Carga manual de 10 productos (screenshot de listado ML)
-- Precio neto = precio mostrado / 1.21 (IVA 21%) / 1.10 (recargo efectivo 10%)
-- EAN queda en null: se completa a mano después.
-- Pegar tal cual en el SQL Editor de Supabase.

with new_products (id, name, sku, ean, stock, marca, unit_price) as (
  values
    (gen_random_uuid(), 'Dadatina Muñequera ACF by Dadatina', 'DADATINA-MUNEQUERA-ACF-HBTR', null::text, 1, 'Dadatina', 4177.31),
    (gen_random_uuid(), 'Emulsión Post Solar Dadatina Camuflaje UV', 'EMULSION-POST-SOLAR-DADATINA-QJGF', null::text, 3, 'Dadatina', 4177.31),
    (gen_random_uuid(), 'Fotoprotector Facial Dadatina UV SPF 40 Protect & Prime', 'FOTOPROTECTOR-FACIAL-DADATINA-3CBF', null::text, 3, 'Dadatina', 8084.15),
    (gen_random_uuid(), 'Protector Labial FPS 35 Camuflaje ACF by Dadatina x 1 g', 'PROTECTOR-LABIAL-FPS-35-PQ8B', null::text, 4, 'Dadatina', 3876.78),
    (gen_random_uuid(), 'Protector Solar Garnier Super UV Anti Imperfecciones', 'PROTECTOR-SOLAR-GARNIER-IMPERF-N2Q4', null::text, 1, 'Garnier', 10514.65),
    (gen_random_uuid(), 'Protector Solar Garnier Super UV Anti Manchas', 'PROTECTOR-SOLAR-GARNIER-MANCHAS-TAL3', null::text, 3, 'Garnier', 9763.34),
    (gen_random_uuid(), 'Protector Solar Invisible FPS 40 ACF by Dadatina x 50 g', 'PROTECTOR-SOLAR-INVISIBLE-FPS40-XTKP', null::text, 3, 'Dadatina', 8384.67),
    (gen_random_uuid(), 'Protector Solar L''Oreal Paris UV Defender Fluido Tono Claro FPS50+', 'PROTECTOR-SOLAR-LOREAL-UV-DEF-XGF0', null::text, 1, 'L''Oreal Paris', 12017.28),
    (gen_random_uuid(), 'Base de Maquillaje L''Oreal Paris True Match Serum', 'BASE-MAQUILLAJE-LOREAL-TRUE-MATCH-GYYS', null::text, 1, 'L''Oreal Paris', 24412.85),
    (gen_random_uuid(), 'Corrector de Ojos Maybelline Super Stay Active Wear 30hs', 'CORRECTOR-OJOS-MAYBELLINE-SUPERSTAY-C5H0', null::text, 3, 'Maybelline', 23658.90)
),
inserted_inventory as (
  insert into inventory (id, name, sku, ean, stock, marca, unit_price)
  select id, name, sku, ean, stock, marca, unit_price from new_products
  returning id, stock
)
insert into stock_movements (inventory_id, delta, reason)
select id, stock, 'stock inicial'
from inserted_inventory
where stock > 0;
