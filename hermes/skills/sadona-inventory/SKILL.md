---
name: sadona-inventory
description: Consultar el inventario de SADONA (mayorista de cosmética, Argentina) por API de solo lectura - stock, precios de costo, marcas, productos sin stock, stock bajo, ingresos por factura, movimientos y estadísticas. Usar cuando pregunten por stock, productos, marcas, qué entró, qué falta o cómo viene el inventario.
version: 1.0.0
metadata:
  hermes:
    tags: [inventory, sadona, api]
    category: business
    requires_toolsets: [terminal]
required_environment_variables:
  - name: SADONA_API_KEY
    prompt: API key privada de SADONA (sdn_prv_...)
    help: Se crea con `node --env-file=.env scripts/api-key.mjs create "Hermes" private` en el proyecto del inventario.
    required_for: consultar el inventario
  - name: SADONA_API_URL
    prompt: URL base de la API de SADONA
    help: En pruebas locales, http://localhost:3000/api/v1
    required_for: consultar el inventario
---

# Inventario SADONA (solo lectura)

La API devuelve JSON. Se usa con `curl` desde la terminal. **Es de solo lectura: no se puede modificar nada.**
Si alguien pide cargar, editar o borrar productos/stock, explicá que por ahora eso se hace desde la app web.

## Cómo llamar

```bash
curl -s -H "Authorization: Bearer $SADONA_API_KEY" "$SADONA_API_URL/products?q=dove&limit=10"
```

- Siempre `-s`, siempre entre comillas la URL (por los `&`).
- Respuestas de lista: `{ "data": [...], "meta": { "total", "limit", "offset" } }`. Error: `{ "error": { "code", "message" } }`.
- `meta.total` es el total real; si hay más de lo devuelto, paginá con `offset` o avisá cuántos faltan.
- 401 = key inválida/revocada. 403 = sin permiso. 429 = demasiadas requests (esperá `Retry-After` segundos).
- Nunca muestres ni repitas la API key en las respuestas.

## Endpoints

| Qué | Request |
|---|---|
| Buscar productos | `GET /products?q=<texto>&marca=<marca>&in_stock=true\|false&supplier=<prov>&sort=name\|stock\|marca\|unit_price\|updated_at&order=asc\|desc&limit=<1-200>&offset=<n>` |
| Un producto | `GET /products/<ean o sku>` (acepta ceros iniciales de más o de menos) |
| Sin stock | `GET /out-of-stock?limit=` (los que se quedaron sin stock más recientemente, primero) |
| Stock bajo | `GET /low-stock?threshold=5&include_zero=false&limit=` |
| Marcas | `GET /brands` (marca, cantidad de productos, unidades) |
| Ingresos por factura | `GET /arrivals?since=YYYY-MM-DD&is_new=true&limit=` (trae `old_price` si el precio cambió) |
| Movimientos de stock | `GET /movements?ean=<ean>&type=in\|out&since=YYYY-MM-DD&limit=` |
| Resumen y más vendidos | `GET /stats?low_stock_threshold=5&top=10` |

`q` busca en nombre, marca, EAN y SKU; todas las palabras tienen que aparecer. **Cuando preguntan por una marca ("productos de Garnier", "cuánto Dove hay"), usá `marca=<MARCA>` y no `q=`**, para no mezclar productos de otras marcas que solo la nombran. Si `marca=` no devuelve nada, probá con `GET /brands` para ver cómo está escrita o caé a `q=`.

## Cómo interpretar los datos

- `unit_price` es el **costo neto de compra** (sin IVA, sin margen de ganancia). **No es el precio de venta.** Si preguntan "a cuánto lo vendo", aclará que solo tenés el costo y que el precio de venta se arma sumando margen e IVA.
- `stock` es unidades. `0` = sin stock.
- `delta` en movimientos: positivo = entró, negativo = salió (venta/uso/ajuste).
- `is_new: true` en ingresos = el producto no existía y se creó con esa factura.
- `old_price` no nulo = el precio de costo cambió en esa factura (comparalo con `unit_price`).
- `inventory_value_net` en stats = suma de costo × stock, sin IVA.
- Las marcas están en MAYÚSCULAS (MAYBELLINE, LOREAL, SALLY HANSEN...).

## Cómo responder

- En español rioplatense, corto y directo. Pensado para leerse en WhatsApp: sin tablas ni markdown pesado; listas simples de una línea por producto.
- Precios en pesos argentinos con separador de miles: `$12.345,67`.
- Nunca inventes productos, cantidades ni precios: si la API no devuelve nada, decí que no encontraste el producto y ofrecé buscar con otras palabras o por marca.
- Si la búsqueda da muchos resultados, mostrá los primeros 10 y decí cuántos hay en total.
- Si hay varios productos parecidos, listalos y preguntá cuál quiere antes de dar datos de uno solo.
- Cuando muestres un producto: nombre, marca, stock y costo; incluí EAN solo si lo piden.

## Ejemplos de preguntas y qué hacer

- "¿Cuánto Dove nos queda?" -> `/products?q=dove&in_stock=true&limit=50` y resumí por línea/stock total (podés usar `/brands`).
- "¿Qué se quedó sin stock?" -> `/out-of-stock?limit=15`.
- "¿Qué entró esta semana?" -> `/arrivals?since=<hace 7 días>`; separá los productos nuevos (`is_new`) y mencioná cambios de precio.
- "¿Qué está por agotarse?" -> `/low-stock?include_zero=false`.
- "¿Cómo viene el inventario?" -> `/stats`.
- "¿Cuánto se movió el 7791293049694?" -> `/movements?ean=7791293049694&limit=30`.

## Avisos automáticos (cron)

Para reportes programados (por ejemplo "todos los días a las 9, avisame qué se quedó sin stock"): consultá el endpoint correspondiente, comparalo con lo que ya avisaste antes (guardalo en memoria) y avisá **solo si hay novedades**. Si no hay nada nuevo, no mandes mensaje.
