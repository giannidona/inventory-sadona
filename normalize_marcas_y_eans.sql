-- Normalización de datos de inventory, paso 1:
--   A) Un solo EAN por producto cuando la BD los tomó como distintos por el 0 inicial
--      (ej. 041554559415 vs 41554559415) -> se fusionan en una sola fila.
--   B) Una sola forma de escribir cada marca (MAYBELLINE/Maybelline/MB -> MAYBELLINE, etc.).
-- Pegar entero en el SQL Editor de Supabase. Corre en una transacción: si algo falla, no cambia nada.
-- Antes de tocar nada guarda una copia en inventory_backup_20261008 (para volver atrás si hace falta).

begin;

-- 0) Backup (con RLS activado y sin policies, para que NO quede expuesto por la API pública)
create table if not exists inventory_backup_20261008 as table inventory;
alter table inventory_backup_20261008 enable row level security;

-- A) EANs duplicados por cero inicial ------------------------------------------------------
-- Limpieza de espacios (hay un EAN con espacio al final: "7791293025780 ")
update inventory set ean = btrim(ean) where ean is not null and ean <> btrim(ean);
update inventory set sku = btrim(sku) where sku is not null and sku <> btrim(sku);

do $$
declare
  grp record;
  keep record;
  lose record;
  canon_ean text;
begin
  for grp in
    select ltrim(ean, '0') as k
    from inventory
    where ean ~ '^[0-9]+$'
    group by ltrim(ean, '0')
    having count(distinct ean) > 1          -- mismo código, distinto largo/ceros
  loop
    -- Sobrevive la fila con precio cargado y más reciente
    select * into keep
    from inventory
    where ean ~ '^[0-9]+$' and ltrim(ean, '0') = grp.k
    order by (unit_price is not null) desc, updated_at desc nulls last, created_at desc
    limit 1;

    -- EAN final = la forma más larga (la que conserva el 0 inicial del código de barras real)
    select ean into canon_ean
    from inventory
    where ean ~ '^[0-9]+$' and ltrim(ean, '0') = grp.k
    order by length(ean) desc
    limit 1;

    for lose in
      select * from inventory
      where ean ~ '^[0-9]+$' and ltrim(ean, '0') = grp.k and id <> keep.id
    loop
      -- Mover todo el historial de la fila vieja a la que sobrevive
      update stock_movements set inventory_id = keep.id where inventory_id = lose.id;
      update invoice_items   set inventory_id = keep.id where inventory_id = lose.id;
      update price_changes   set inventory_id = keep.id where inventory_id = lose.id;
      update stock_arrivals  set inventory_id = keep.id where inventory_id = lose.id;

      -- Sumar el stock y completar datos que le falten a la que sobrevive
      update inventory set
        stock    = stock + lose.stock,
        marca    = coalesce(marca, lose.marca),
        supplier = coalesce(supplier, lose.supplier),
        unit_price = coalesce(unit_price, lose.unit_price)
      where id = keep.id;

      -- Borrar la duplicada ANTES de renombrar sku/ean (por si hay restricción de unicidad)
      delete from inventory where id = lose.id;
    end loop;

    -- Regla del sistema: con EAN conocido, SKU = EAN
    update inventory set ean = canon_ean, sku = canon_ean, updated_at = now() where id = keep.id;
  end loop;
end $$;

-- B) Marcas ---------------------------------------------------------------------------------
-- Primero los alias conocidos (abreviaturas / variantes), después todo a MAYÚSCULAS sin espacios sobrantes.
with alias(old, canon) as (values
  ('L''Oreal Paris', 'LOREAL'),
  ('MB',             'MAYBELLINE'),
  ('RML',            'RIMMEL'),
  ('RIMMEL LONDON',  'RIMMEL'),
  ('RV',             'REVLON'),
  ('S.H',            'SALLY HANSEN'),
  ('SALLY',          'SALLY HANSEN'),
  ('DRMGLOS',        'DERMAGLOS'),
  ('NEU.',           'NEUTROGENA'),
  ('BANDERAS',       'ANTONIO BANDERAS'),
  ('Antonio Banderas','ANTONIO BANDERAS'),
  ('Nivea Sun',      'NIVEA'),
  ('NUTRISS',        'NUTRISSE'),
  ('JUST',           'JUST FOR MEN'),
  ('ORALB',          'ORAL-B'),
  ('Q Soft',         'Q-SOFT'),
  ('St Ives',        'ST IVES'),
  ('ST.IVES',        'ST IVES')
)
update inventory i
set marca = coalesce(a.canon, upper(btrim(i.marca)))
from (select id, marca from inventory where marca is not null) src
left join alias a on a.old = btrim(src.marca)
where i.id = src.id
  and i.marca is distinct from coalesce(a.canon, upper(btrim(src.marca)));

-- Verificación (mirá estos resultados antes de confirmar)
select count(*) as productos_total from inventory;
select count(distinct marca) as marcas_distintas from inventory;
select marca, count(*) from inventory group by marca order by marca;
select ltrim(ean,'0') as ean_sin_ceros, count(*) from inventory
  where ean ~ '^[0-9]+$' group by 1 having count(distinct ean) > 1;   -- debe dar 0 filas

commit;
