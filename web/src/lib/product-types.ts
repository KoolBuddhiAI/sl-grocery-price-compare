import type { NormalizedProduct } from './api';
import mappingData from '../data/product-type-mapping.json';

export type ProductType = {
  id: string;
  label: string;
  subcategory: string;
};

export type ProductTypeMapping = {
  id: string;
  store: string;
  name: string;
  product_type: string;
  confidence: string;
};

export type ProductTypeData = {
  types: ProductType[];
  products: ProductTypeMapping[];
};

const data = mappingData as ProductTypeData;

const productTypeIndex = new Map<string, string>();
for (const p of data.products) {
  productTypeIndex.set(p.id, p.product_type);
}

export function getProductType(productId: string): string | undefined {
  return productTypeIndex.get(productId);
}

export function getAllTypes(): ProductType[] {
  return data.types;
}

export function getAllSubcategories(): string[] {
  const subs = new Set(data.types.map((t) => t.subcategory));
  return Array.from(subs);
}

export type GroupedProducts = {
  type: ProductType;
  products: NormalizedProduct[];
};

export function groupProductsByType(products: NormalizedProduct[]): GroupedProducts[] {
  const typeMap = new Map<string, ProductType>();
  for (const t of data.types) {
    typeMap.set(t.id, t);
  }

  const groups = new Map<string, NormalizedProduct[]>();

  for (const product of products) {
    const typeId = getProductType(product.id) ?? 'uncategorized';
    if (!groups.has(typeId)) {
      groups.set(typeId, []);
    }
    groups.get(typeId)!.push(product);
  }

  const result: GroupedProducts[] = [];
  for (const t of data.types) {
    const prods = groups.get(t.id);
    if (prods && prods.length > 0) {
      // Sort by unit price, cheapest first; nulls last
      prods.sort((a, b) => {
        if (a.price_per_kg_lkr === null && b.price_per_kg_lkr === null) return 0;
        if (a.price_per_kg_lkr === null) return 1;
        if (b.price_per_kg_lkr === null) return -1;
        return a.price_per_kg_lkr - b.price_per_kg_lkr;
      });
      result.push({ type: t, products: prods });
    }
  }

  return result;
}
