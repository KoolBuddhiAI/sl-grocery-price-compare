export const API_BASE = import.meta.env.PUBLIC_API_URL || 'http://localhost:8787';

export type Store = 'keells' | 'glomark' | 'cargills';

export type NormalizedProduct = {
  id: string;
  store: Store;
  source_url: string;
  source_product_id: string | null;
  source_category: string;
  captured_at: string;
  source_status: string;
  name: string;
  displayed_price_lkr: number | null;
  displayed_currency: 'LKR';
  price_direction: 'up' | 'down' | 'same' | null;
  previous_price_lkr: number | null;
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
  categories: string[];
  stores: Record<string, Record<string, StoreMeta & { count: number }>>;
};

/** Flatten the nested health response for a specific category */
export function getStoresForCategory(
  health: HealthResponse,
  category: string
): Record<string, StoreMeta & { count: number }> {
  return health.stores[category] ?? {};
}

/** Get aggregate store stats across all categories */
export function getAggregateStoreStats(
  health: HealthResponse
): Record<string, { count: number; latestCapturedAt: string | null; source_status: string }> {
  const result: Record<string, { count: number; latestCapturedAt: string | null; source_status: string }> = {};
  for (const category of Object.values(health.stores)) {
    for (const [store, meta] of Object.entries(category)) {
      if (!result[store]) {
        result[store] = { count: 0, latestCapturedAt: null, source_status: 'not_found' };
      }
      result[store].count += meta.count || 0;
      if (meta.captured_at && (!result[store].latestCapturedAt || meta.captured_at > result[store].latestCapturedAt)) {
        result[store].latestCapturedAt = meta.captured_at;
      }
      if (meta.source_status === 'ok') {
        result[store].source_status = 'ok';
      }
    }
  }
  return result;
}

export async function fetchProducts(store?: string, category?: string): Promise<ProductsResponse> {
  const url = new URL(`${API_BASE}/api/products`);
  if (store) url.searchParams.set('store', store);
  if (category) url.searchParams.set('category', category);
  const res = await fetch(url);
  return res.json();
}

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE}/api/health`);
  return res.json();
}

export async function fetchHistory(store: string, category: string = 'meat') {
  const res = await fetch(`${API_BASE}/api/history?store=${store}&category=${category}`);
  return res.json();
}
