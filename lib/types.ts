export type InventoryItem = {
  id: string;
  name: string;
  sku: string;
  ean: string | null;
  stock: number;
  marca: string | null;
  created_at: string;
  updated_at: string;
};

export type StockMovement = {
  id: string;
  inventory_id: string;
  delta: number;
  reason: string | null;
  created_at: string;
};

export type ProductFormData = {
  name: string;
  sku: string;
  ean?: string;
  stock?: number;
  marca?: string;
};
