import type { NextRequest } from "next/server";
import { apiJson, apiOptions } from "@/lib/api";

export const OPTIONS = apiOptions;

const pagination = [
  { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 500 } },
  { name: "offset", in: "query", schema: { type: "integer", minimum: 0 } },
];

const productPublic = {
  type: "object",
  properties: {
    name: { type: "string" },
    sku: { type: "string" },
    ean: { type: "string", nullable: true },
    marca: { type: "string", nullable: true },
    stock: { type: "integer" },
    unit_price: {
      type: "number",
      nullable: true,
      description: "Costo neto de compra (sin IVA ni margen).",
    },
  },
};

const productPrivate = {
  allOf: [
    { $ref: "#/components/schemas/ProductPublic" },
    {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        supplier: { type: "string", nullable: true },
        created_at: { type: "string", format: "date-time" },
        updated_at: { type: "string", format: "date-time" },
      },
    },
  ],
};

const listResponse = (ref: string) => ({
  "200": {
    description: "OK",
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            data: { type: "array", items: { $ref: ref } },
            meta: {
              type: "object",
              properties: {
                total: { type: "integer" },
                limit: { type: "integer" },
                offset: { type: "integer" },
              },
            },
          },
        },
      },
    },
  },
});

const spec = {
  openapi: "3.0.3",
  info: {
    title: "SADONA Inventory API",
    version: "1.0.0",
    description:
      "API del inventario. Tres scopes de key: `public` (web de SADONA: nombre, marca, stock, precio), `private` (uso interno / Hermes: además proveedor, movimientos, ingresos y estadísticas) y `write` (todo lo anterior + crear, editar, ajustar stock y eliminar). Cada escritura queda registrada en `api_audit_log`. Enviá la key como `Authorization: Bearer <key>` o `X-API-Key`. Errores: `{ error: { code, message } }`.",
  },
  servers: [{ url: "/api/v1" }],
  security: [{ bearer: [] }, { apiKey: [] }],
  paths: {
    "/health": { get: { summary: "Estado de la API (sin auth)", security: [], responses: { "200": { description: "OK" } } } },
    "/products": {
      get: {
        summary: "Listar / buscar productos",
        description: "Scope: public. `supplier` solo funciona con key private.",
        parameters: [
          { name: "q", in: "query", description: "Busca en nombre, marca, EAN y SKU (todas las palabras)", schema: { type: "string" } },
          { name: "marca", in: "query", schema: { type: "string" } },
          { name: "in_stock", in: "query", schema: { type: "boolean" } },
          { name: "supplier", in: "query", description: "Solo private", schema: { type: "string" } },
          { name: "sort", in: "query", schema: { type: "string", enum: ["name", "stock", "marca", "unit_price", "updated_at", "created_at"] } },
          { name: "order", in: "query", schema: { type: "string", enum: ["asc", "desc"] } },
          ...pagination,
        ],
        responses: listResponse("#/components/schemas/ProductPublic"),
      },
      post: {
        summary: "Crear producto (scope write)",
        description:
          "Si hay `ean`, el SKU queda igual al EAN. Sin `ean` hace falta `sku`. `marca` y `supplier` reutilizan la escritura que ya existe (LOREAL, no Loreal); una marca nueva se guarda en MAYÚSCULAS. `unit_price` es costo neto sin IVA. Devuelve 409 con el producto existente si el EAN/SKU ya está cargado.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name"],
                properties: {
                  name: { type: "string" },
                  ean: { type: "string", description: "6-14 dígitos" },
                  sku: { type: "string", description: "Solo si no hay ean" },
                  marca: { type: "string" },
                  supplier: { type: "string" },
                  unit_price: { type: "number", minimum: 0 },
                  stock: { type: "integer", minimum: 0, default: 0 },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Creado" }, "400": { description: "Datos inválidos" }, "409": { description: "Ya existe" } },
      },
    },
    "/products/{ean}": {
      get: {
        summary: "Un producto por EAN o SKU (tolera ceros iniciales)",
        parameters: [{ name: "ean", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "OK" }, "404": { description: "No existe" } },
      },
      patch: {
        summary: "Editar producto (scope write)",
        description:
          "Solo cambia los campos que se envían: name, ean, sku, marca, supplier, unit_price (null lo borra). Si cambia el ean, el SKU pasa a ser igual. El stock NO se edita acá: usar /products/{ean}/stock.",
        parameters: [{ name: "ean", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  ean: { type: "string", nullable: true },
                  sku: { type: "string", description: "Solo en productos sin EAN" },
                  marca: { type: "string", nullable: true },
                  supplier: { type: "string", nullable: true },
                  unit_price: { type: "number", nullable: true },
                },
              },
            },
          },
        },
        responses: { "200": { description: "OK" }, "404": { description: "No existe" }, "409": { description: "EAN/SKU duplicado" } },
      },
      delete: {
        summary: "Eliminar producto y todo su historial (scope write)",
        description:
          "Irreversible desde la API (queda un snapshot en api_audit_log). Requiere `confirm=true`; si el producto tiene stock, además `force=true`.",
        parameters: [
          { name: "ean", in: "path", required: true, schema: { type: "string" } },
          { name: "confirm", in: "query", required: true, schema: { type: "boolean" } },
          { name: "force", in: "query", schema: { type: "boolean" } },
        ],
        responses: { "200": { description: "Eliminado" }, "400": { description: "Falta confirm" }, "409": { description: "Tiene stock (falta force)" } },
      },
    },
    "/products/{ean}/stock": {
      post: {
        summary: "Ajustar stock con historial (scope write)",
        description: "Mandar exactamente uno: `delta` (suma/resta) o `set` (stock exacto). `reason` es opcional. El stock no puede quedar negativo.",
        parameters: [{ name: "ean", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  delta: { type: "integer", description: "Distinto de 0" },
                  set: { type: "integer", minimum: 0 },
                  reason: { type: "string" },
                },
              },
            },
          },
        },
        responses: { "200": { description: "OK" }, "404": { description: "No existe" }, "409": { description: "Stock insuficiente o conflicto" } },
      },
    },
    "/out-of-stock": {
      get: { summary: "Productos sin stock (más recientes primero)", parameters: pagination, responses: listResponse("#/components/schemas/ProductPublic") },
    },
    "/brands": { get: { summary: "Marcas con cantidad de productos y unidades", responses: { "200": { description: "OK" } } } },
    "/low-stock": {
      get: {
        summary: "Stock bajo (private)",
        parameters: [
          { name: "threshold", in: "query", schema: { type: "integer", default: 5 } },
          { name: "include_zero", in: "query", schema: { type: "boolean", default: true } },
          ...pagination,
        ],
        responses: listResponse("#/components/schemas/ProductPrivate"),
      },
    },
    "/arrivals": {
      get: {
        summary: "Ingresos de stock por factura, con precio anterior (private)",
        parameters: [
          { name: "since", in: "query", description: "YYYY-MM-DD", schema: { type: "string" } },
          { name: "is_new", in: "query", description: "Solo productos creados por la factura", schema: { type: "boolean" } },
          ...pagination,
        ],
        responses: { "200": { description: "OK" } },
      },
    },
    "/movements": {
      get: {
        summary: "Historial de movimientos de stock (private)",
        parameters: [
          { name: "ean", in: "query", description: "EAN o SKU", schema: { type: "string" } },
          { name: "type", in: "query", schema: { type: "string", enum: ["in", "out"] } },
          { name: "since", in: "query", schema: { type: "string" } },
          ...pagination,
        ],
        responses: { "200": { description: "OK" } },
      },
    },
    "/stats": {
      get: {
        summary: "Resumen del inventario y más vendidos (private)",
        parameters: [
          { name: "low_stock_threshold", in: "query", schema: { type: "integer", default: 5 } },
          { name: "top", in: "query", schema: { type: "integer", default: 10, maximum: 50 } },
        ],
        responses: { "200": { description: "OK" } },
      },
    },
  },
  components: {
    securitySchemes: {
      bearer: { type: "http", scheme: "bearer" },
      apiKey: { type: "apiKey", in: "header", name: "X-API-Key" },
    },
    schemas: { ProductPublic: productPublic, ProductPrivate: productPrivate },
  },
};

/** GET /api/v1/openapi.json — especificación OpenAPI 3 (sin auth). */
export async function GET(request: NextRequest) {
  return apiJson(request, spec, { headers: { "Cache-Control": "public, max-age=300" } });
}
