export type InventoryItem = {
  id: string;
  name: string;
  sku: string;
  ean: string | null;
  stock: number;
  marca: string | null;
  unit_price: number | null;
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
  unit_price?: number;
};

export type Invoice = {
  id: string;
  invoice_number: string;
  invoice_type: string | null;
  invoice_date: string | null;
  supplier: string | null;
  supplier_cuit: string | null;
  cae: string | null;
  cae_expiry: string | null;
  file_path: string | null;
  file_name: string | null;
  subtotal: number | null;
  iva_amount: number | null;
  total: number | null;
  total_units: number | null;
  item_count: number | null;
  notes: string | null;
  created_at: string;
};

export type InvoiceItem = {
  id: string;
  invoice_id: string;
  inventory_id: string | null;
  product_name: string;
  sku: string | null;
  quantity: number;
  unit_price: number | null;
  created_at: string;
};

export type InvoiceLineInput = {
  name: string;
  sku?: string;
  ean?: string;
  marca?: string;
  quantity: number;
  unit_price?: number;
};

export type ProcessInvoiceInput = {
  invoice_number: string;
  invoice_type?: string;
  invoice_date?: string;
  supplier?: string;
  supplier_cuit?: string;
  cae?: string;
  cae_expiry?: string;
  subtotal?: number;
  iva_amount?: number;
  total?: number;
  total_units?: number;
  item_count?: number;
  notes?: string;
  lines: InvoiceLineInput[];
};

export type ProcessInvoiceResult = {
  invoice_id: string;
  created: number;
  updated: number;
  items: Array<{
    product_name: string;
    action: "created" | "updated";
    new_stock: number;
  }>;
};
