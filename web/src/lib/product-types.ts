import type { NormalizedProduct } from './api';
import type { MergeRule } from './merge-rules';
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
  mergeRuleId?: string;
};

// Brand prefixes to strip when computing the core product name
const BRAND_PREFIXES = [
  'bee safe', 'good harvest', 'honest greens', 'three star organic',
  'fresh leaf', 'changami', 'organic', 'local', 'premium',
  'dole', 'del monte',
];

/**
 * Extract the core product name by stripping brand prefixes, size suffixes,
 * and normalizing for grouping. E.g.:
 *   "Bee Safe Cabbage Leaves" → "cabbage leaves"
 *   "Cabbage" → "cabbage"
 *   "Bell Pepper Red" → "bell pepper red"
 *   "Big Onion Premium" → "big onion"
 */
function coreProductName(name: string): string {
  let n = name.toLowerCase().trim();
  // Strip brand prefixes
  for (const prefix of BRAND_PREFIXES) {
    if (n.startsWith(prefix + ' ')) {
      n = n.slice(prefix.length).trim();
    }
  }
  // Strip trailing weight/size like "100g", "150G", "300G", "500g"
  n = n.replace(/\s+\d+\s*[gG]\s*$/, '').trim();
  // Strip "premium" suffix
  n = n.replace(/\s+premium$/i, '').trim();
  return n;
}

/**
 * Compute a group key from the core name.
 * Products with the same group key are shown together.
 * E.g. "cabbage" and "cabbage leaves" share group key "cabbage"
 */
function groupKey(coreName: string): string {
  // Use the full core name as key — products must match exactly to group
  // But treat singular/plural as same: "onion" = "onions"
  let key = coreName.replace(/s$/, '');
  // Also normalize "ash plantain" / "ash plantains"
  return key;
}

/**
 * Find the best display label for a group of products.
 * Pick the shortest, most generic name.
 */
function bestLabel(names: string[]): string {
  const sorted = [...names].sort((a, b) => a.length - b.length);
  // Capitalize first letter of each word
  return sorted[0].replace(/\b\w/g, c => c.toUpperCase());
}

function sortByUnitPrice(products: NormalizedProduct[]): NormalizedProduct[] {
  return [...products].sort((a, b) => {
    if (a.price_per_kg_lkr === null && b.price_per_kg_lkr === null) return 0;
    if (a.price_per_kg_lkr === null) return 1;
    if (b.price_per_kg_lkr === null) return -1;
    return a.price_per_kg_lkr - b.price_per_kg_lkr;
  });
}

export function groupProductsForCategory(products: NormalizedProduct[], category: string): GroupedProducts[] {
  if (category === 'meat') {
    return groupProductsByType(products);
  }

  // Auto-group by normalized product name
  const groups = new Map<string, { coreNames: Set<string>; products: NormalizedProduct[] }>();

  for (const product of products) {
    const core = coreProductName(product.name);
    const key = groupKey(core);

    if (!groups.has(key)) {
      groups.set(key, { coreNames: new Set(), products: [] });
    }
    const group = groups.get(key)!;
    group.coreNames.add(core);
    group.products.push(product);
  }

  // Convert to GroupedProducts, sorted by cheapest unit price per group
  const result: GroupedProducts[] = [];
  for (const [key, group] of groups) {
    const label = bestLabel([...group.coreNames]);
    const sorted = sortByUnitPrice(group.products);
    result.push({
      type: { id: key, label, subcategory: 'All' },
      products: sorted,
    });
  }

  // Sort groups by their cheapest product's unit price
  result.sort((a, b) => {
    const aMin = a.products[0]?.price_per_kg_lkr ?? Infinity;
    const bMin = b.products[0]?.price_per_kg_lkr ?? Infinity;
    return aMin - bMin;
  });

  return result;
}

export function applyMergeRules(groups: GroupedProducts[], rules: MergeRule[]): GroupedProducts[] {
  if (rules.length === 0) return groups;

  // Build lookup: group key → rule
  const keyToRule = new Map<string, MergeRule>();
  for (const rule of rules) {
    for (const key of rule.sourceGroupKeys) {
      keyToRule.set(key, rule);
    }
  }

  // Collect groups by rule ID
  const mergedByRule = new Map<string, { rule: MergeRule; products: NormalizedProduct[] }>();
  const ungrouped: GroupedProducts[] = [];

  for (const group of groups) {
    const rule = keyToRule.get(group.type.id);
    if (rule) {
      if (!mergedByRule.has(rule.id)) {
        mergedByRule.set(rule.id, { rule, products: [] });
      }
      mergedByRule.get(rule.id)!.products.push(...group.products);
    } else {
      ungrouped.push(group);
    }
  }

  // Build merged groups
  const merged: GroupedProducts[] = [];
  for (const [, { rule, products }] of mergedByRule) {
    if (products.length === 0) continue;
    merged.push({
      type: { id: rule.id, label: rule.label, subcategory: 'All' },
      products: sortByUnitPrice(products),
      mergeRuleId: rule.id,
    });
  }

  // Combine and re-sort by cheapest unit price
  const result = [...merged, ...ungrouped];
  result.sort((a, b) => {
    const aMin = a.products[0]?.price_per_kg_lkr ?? Infinity;
    const bMin = b.products[0]?.price_per_kg_lkr ?? Infinity;
    return aMin - bMin;
  });

  return result;
}

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
