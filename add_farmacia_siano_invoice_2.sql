-- Carga de la factura Farmacia Siano (Comp.Nro. 00292624, 04/09/2026).
-- SKU = EAN (código de barras de la factura). Costo = precio unitario / 1.21
-- (se le saca el 21% de IVA). Se excluye "ENVIO A DOMICILIO".
--
-- Por cada línea: si el EAN ya existe en inventory, SUMA el stock, actualiza
-- el costo y el proveedor; si no existe, crea el producto nuevo con
-- proveedor "Farmacia Siano". Se puede correr una sola vez sin duplicar
-- productos que ya tenías (dos de estos códigos ya habían entrado con la
-- factura anterior de este mismo proveedor).
-- Pegar tal cual en el SQL Editor de Supabase. Requiere haber corrido antes
-- la migración 010_inventory_supplier.sql.

do $$
declare
  rec record;
  v_id uuid;
begin
  for rec in
    select * from (values
      ('7509552840346', 'DERMAGLOS EXPRESSION REV AH OJOS X15', 1, 27215.00::numeric, 'Dermaglos'),
      ('7793008017400', 'ISSUE TRATAMIENTO CAPILAR CUBRE CANAS X150', 2, 3504.50::numeric, 'Issue'),
      ('7509552920932', 'FRUCTIS RIZOS PODEROSOS SHAMPOO X350', 3, 6960.67::numeric, 'Garnier'),
      ('7500435178631', 'GILLETTE MAQUINA DE AFEITAR MACH3 CORP X1', 6, 15650.00::numeric, 'Gillette'),
      ('7500435113441', 'GILLETTE ANTITRANSPIRANTE GEL ANTIBACTERIAL X93', 2, 8375.00::numeric, 'Gillette')
    ) as t(ean, name, qty, gross_price, marca)
  loop
    select id into v_id from inventory where ean = rec.ean;

    if v_id is not null then
      update inventory
      set stock = stock + rec.qty,
          unit_price = round(rec.gross_price / 1.21, 2),
          supplier = 'Farmacia Siano',
          updated_at = now()
      where id = v_id;
    else
      insert into inventory (name, sku, ean, stock, marca, supplier, unit_price)
      values (rec.name, rec.ean, rec.ean, rec.qty, rec.marca, 'Farmacia Siano', round(rec.gross_price / 1.21, 2))
      returning id into v_id;
    end if;

    insert into stock_movements (inventory_id, delta, reason)
    values (v_id, rec.qty, 'factura Farmacia Siano #00292624');
  end loop;
end $$;
