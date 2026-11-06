-- Deja el stock de TODOS los productos en 0 y borra el historial de movimientos.
-- Antes de correr: se hace un respaldo de lo que se va a borrar/cambiar (tablas *_backup_YYYYMMDD).
-- Todo corre en una transacción: si algo falla, no queda nada a medias.
--
-- Conserva: productos, precios de costo, proveedores, facturas y "Cambios de precio".
-- Borra:    stock_movements (historial de movimientos) y stock_arrivals (pestaña Ingresos).
-- Si NO querés borrar la pestaña Ingresos, comentá la última línea del bloque de borrado.

begin;

-- 1) Respaldo
create table inventory_stock_backup_20261107 as
  select id, name, sku, ean, stock from inventory;
create table stock_movements_backup_20261107 as
  select * from stock_movements;
create table stock_arrivals_backup_20261107 as
  select * from stock_arrivals;

-- 2) Stock en 0 (las filas ya en 0 no se tocan)
update inventory set stock = 0, updated_at = now() where stock <> 0;

-- 3) Borrar historial
delete from stock_movements;
delete from stock_arrivals;

-- 4) Chequeo: tiene que dar 0 / 0 / 0
select
  (select count(*) from inventory where stock <> 0) as productos_con_stock,
  (select count(*) from stock_movements)            as movimientos,
  (select count(*) from stock_arrivals)             as ingresos;

commit;

-- Para volver atrás (solo si hace falta):
--   update inventory i set stock = b.stock from inventory_stock_backup_20261107 b where b.id = i.id;
--   insert into stock_movements select * from stock_movements_backup_20261107;
--   insert into stock_arrivals  select * from stock_arrivals_backup_20261107;
