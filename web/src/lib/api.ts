const API_BASE = import.meta.env.PUBLIC_API_URL || 'http://localhost:8787';

export type Store = 'keells' | 'glomark' | 'cargills';

export type NormalizedProduct = {
  id: string;
  store: Store;
  source_url: string;
  source_product_id: string | null;
  source_category: 'meat';
  captured_at: string;
  source_status: string;
  name: string;
  displayed_price_lkr: number | null;
  displayed_currency: 'LKR';
  in_stock: boolean | null;
  pack_qty: number | null;
  pack_unit: string;
  net_weight_g: number | null;
  price_per_kg_lkr: number | null;
  raw_size_text: string | null;
  notes: string | null;
};

export type StoreMeta = {
  store: Store;
  mode: string;
  source_status: string;
  captured_at: string | null;
  extraction_mode: string | null;
  count?: number;
};

export type ProductsResponse = {
  data: NormalizedProduct[];
  meta: {
    total: number;
    category: string;
    stores: Record<string, StoreMeta>;
  };
};

export type HealthResponse = {
  stores: Record<string, StoreMeta & { count: number }>;
};

export async function fetchProducts(store?: string): Promise<ProductsResponse> {
  const url = new URL(`${API_BASE}/api/products`);
  if (store) url.searchParams.set('store', store);
  const res = await fetch(url);
  return res.json();
}

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE}/api/health`);
  return res.json();
}
