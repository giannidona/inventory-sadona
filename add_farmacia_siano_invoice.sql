-- Carga de la factura Farmacia Siano (Comp.Nro. 00291364, 26/08/2026).
-- SKU = EAN (código de barras que ya trae la factura). El costo se calcula
-- sacando el 21% de IVA del precio unitario: costo = precio_unitario / 1.21.
-- Se excluye "ENVIO A DOMICILIO" (no es un producto de inventario).
--
-- Por cada línea: si el EAN ya existe en inventory, SUMA el stock y
-- actualiza el costo; si no existe, crea el producto nuevo. Así el script
-- se puede correr una sola vez sin duplicar productos que ya tenías.
-- Pegar tal cual en el SQL Editor de Supabase.

do $$
declare
  rec record;
  v_id uuid;
begin
  for rec in
    select * from (values
      ('7509552924657', 'FRUCTIS RIZOS PODEROSOS ACONDICIONADOR X350', 3, 7119.00::numeric, 'Garnier'),
      ('7509552920932', 'FRUCTIS RIZOS PODEROSOS SHAMPOO X350', 3, 6939.67::numeric, 'Garnier'),
      ('7500435178631', 'GILLETTE MAQUINA DE AFEITAR MACH3 CORP X1', 3, 17525.00::numeric, 'Gillette'),
      ('7791600015350', 'ALLIANCE DESODORANTE AEROSOL X150', 3, 3951.00::numeric, 'Alliance'),
      ('7509552902846', 'ELVIVE SHAMPOO KERALISO 230 X400', 3, 9660.67::numeric, 'L''Oreal Paris'),
      ('7509552791266', 'ELVIVE SHAMPOO KERALISO BRILLO X400', 3, 12368.67::numeric, 'L''Oreal Paris'),
      ('4005900496447', 'NIVEA MEN ESPUMA DE AFEITAR DEEP X200', 2, 9203.50::numeric, 'Nivea')
    ) as t(ean, name, qty, gross_price, marca)
  loop
    select id into v_id from inventory where ean = rec.ean;

    if v_id is not null then
      update inventory
      set stock = stock + rec.qty,
          unit_price = round(rec.gross_price / 1.21, 2),
          updated_at = now()
      where id = v_id;
    else
      insert into inventory (name, sku, ean, stock, marca, unit_price)
      values (rec.name, rec.ean, rec.ean, rec.qty, rec.marca, round(rec.gross_price / 1.21, 2))
      returning id into v_id;
    end if;

    insert into stock_movements (inventory_id, delta, reason)
    values (v_id, rec.qty, 'factura Farmacia Siano #00291364');
  end loop;
end $$;
