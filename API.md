# SADONA Inventory API v1

Base URL: `https://inventory-sadona.vercel.app/api/v1`
Spec OpenAPI (sin auth): `/api/v1/openapi.json`

## Autenticación

Enviar la key en cada request:

```
Authorization: Bearer <KEY>
```
(o `X-API-Key: <KEY>`). Sin key solo responde `/health`.

| Scope | Prefijo | Puede |
|---|---|---|
| `public` | `sdn_pub_` | Leer productos: nombre, sku, ean, marca, stock, unit_price (costo neto). Pensada para la web. |
| `private` | `sdn_prv_` | Todo lo anterior + id, proveedor, fechas, movimientos, ingresos, stats, stock bajo. |
| `write` | `sdn_wrt_` | Todo lo anterior + crear, editar, ajustar stock, eliminar e ingresar mercadería. |

Gestión de keys (en la carpeta del proyecto):

```bash
node --env-file=.env scripts/api-key.mjs create "Nombre" <public|private|write>
node --env-file=.env scripts/api-key.mjs list
node --env-file=.env scripts/api-key.mjs scope <id> <scope>
node --env-file=.env scripts/api-key.mjs revoke <id>
```
La key completa se muestra una sola vez al crearla; en la base solo queda su hash.

Límites por minuto: public 120, private 300, write 300 (429 + `Retry-After`).
Errores: `{ "error": { "code", "message" } }`. Listas: `{ "data": [...], "meta": { "total", "limit", "offset" } }`.

## Lectura

| Endpoint | Scope | Descripción |
|---|---|---|
| `GET /health` | - | Estado (sin auth) |
| `GET /products` | public | Buscar. Params: `q`, `marca`, `in_stock`, `supplier` (private), `sort` (name, stock, marca, unit_price, updated_at, created_at), `order`, `limit` (1-200), `offset` |
| `GET /products/{ean}` | public | Un producto por EAN o SKU (tolera ceros iniciales) |
| `GET /out-of-stock` | public | Sin stock, los más recientes primero |
| `GET /brands` | public | Marcas con cantidad de productos y unidades |
| `GET /low-stock` | private | `threshold` (5), `include_zero`, `limit` |
| `GET /arrivals` | private | Ingresos (factura y manuales). `since=YYYY-MM-DD`, `is_new=true`. Trae `old_price`, `supplier`, `source` |
| `GET /movements` | private | `ean`, `type=in\|out`, `since`, `limit` |
| `GET /stats` | private | Resumen e historial de más vendidos. `low_stock_threshold`, `top` |

`q` busca en nombre, marca, EAN y SKU (todas las palabras). Para marcas usar `marca=`.
`unit_price` es el **costo neto de compra** (sin IVA ni margen), no el precio de venta.

## Escritura (scope `write`)

| Endpoint | Body | Notas |
|---|---|---|
| `POST /products` | `name` (oblig.), `ean`, `sku`, `marca`, `supplier`, `unit_price`, `stock` | SKU = EAN si hay EAN. 409 con el producto existente si ya está. |
| `PATCH /products/{ean}` | `name, ean, sku, marca, supplier, unit_price` (solo los que cambian) | No cambia stock. |
| `POST /products/{ean}/stock` | `{ "delta": -2 }` o `{ "set": 10 }`, `reason` | No deja stock negativo (409). |
| `DELETE /products/{ean}?confirm=true` | - | Con stock, además `&force=true`. Borra también el historial. |
| `POST /arrivals` | `ean` (oblig.), `quantity`, `cost`, `price_includes_iva` (oblig. si hay cost), `iva_rate` (0, 0.105, 0.21, 0.27), `supplier`, `name` y `marca` (producto nuevo), `dry_run` | Ingreso manual. Suma stock, guarda costo neto y proveedor; crea el producto si no existe (422 `needs_name` sin nombre). `dry_run: true` solo devuelve la vista previa. |

Reglas: `marca` y `supplier` reutilizan la escritura existente (LOREAL, no Loreal). Cada escritura queda en `api_audit_log` con el antes y el después.

## Ejemplos

```bash
# Buscar
curl -s -H "Authorization: Bearer $KEY" "$BASE/products?marca=GARNIER&in_stock=true&limit=10"

# Ajustar stock
curl -s -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"delta": -2, "reason": "venta mostrador"}' "$BASE/products/7791293049694/stock"

# Ingreso manual (vista previa)
curl -s -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"ean":"7791293049694","quantity":12,"cost":3500,"price_includes_iva":true,"supplier":"Doan","dry_run":true}' \
  "$BASE/arrivals"
```
