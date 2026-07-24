// External marketplace links, built from a product's SKU.

export function doanProductUrl(sku: string): string {
  return `https://doan.com.ar/index.php?route=product/product&product_id=${encodeURIComponent(sku)}`;
}

export function mercadoLibreSearchUrl(sku: string): string {
  return `https://www.mercadolibre.com.ar/publicaciones?page=1&sort=DEFAULT&search=${encodeURIComponent(sku)}`;
}
