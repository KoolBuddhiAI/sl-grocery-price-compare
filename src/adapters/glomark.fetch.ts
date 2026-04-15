import type { GlomarkImportedSnapshot, GlomarkImportedSnapshotItem, SourceStatus } from "../schema.ts";

const GLOMARK_BASE = "https://glomark.lk";

const CATEGORY_PATHS: Record<string, string> = {
  meat: "/fresh/meat/c/144",
  fish: "/fresh/fish/c/146",
};

type GlomarkRawProduct = {
  id: number;
  name: string;
  erpCode: string;
  price: number;
  promoPrice: number;
  applicablePrice: number;
  displayQuantity: number;
  unit: string;
  stock: number;
  isOutOfStock: boolean;
  image: string;
  brandDetails?: { name: string };
  subCategoryDetails?: { name: string };
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildSizeText(displayQuantity: number, unit: string): string | null {
  if (unit === "g") return `${displayQuantity}g`;
  if (unit === "kg") return `${displayQuantity}kg`;
  return null;
}

function toSnapshotItem(raw: GlomarkRawProduct): GlomarkImportedSnapshotItem {
  const productId = String(raw.id);
  const slug = slugify(raw.name);

  return {
    id: `glomark-${productId}`,
    source_product_id: raw.erpCode || productId,
    name: raw.name,
    source_url: `${GLOMARK_BASE}/${slug}/p/${productId}`,
    displayed_price_lkr: raw.applicablePrice ?? raw.price ?? null,
    raw_size_text: buildSizeText(raw.displayQuantity, raw.unit),
    in_stock: !raw.isOutOfStock,
    brand: raw.brandDetails?.name ?? null,
    sub_category: raw.subCategoryDetails?.name ?? null,
    notes: null,
  };
}

/**
 * Extract the productList JSON array from Glomark's server-rendered HTML.
 *
 * Glomark embeds ALL category products in an inline <script> as:
 *   productList = [{...}, {...}, ...];
 *   productCount = productList.length;
 *
 * There may be multiple `productList = ` in the HTML (one empty from quickSearchLists).
 * We find the one with actual data.
 */
export function extractProductListFromHtml(html: string): GlomarkRawProduct[] {
  let idx = 0;
  while (true) {
    const pos = html.indexOf("productList = [", idx);
    if (pos === -1) return [];

    const jsonStart = pos + "productList = ".length;
    let depth = 0;
    let end = jsonStart;
    for (let i = jsonStart; i < html.length; i++) {
      if (html[i] === "[") depth++;
      if (html[i] === "]") depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }

    try {
      const data = JSON.parse(html.slice(jsonStart, end));
      if (Array.isArray(data) && data.length > 0) {
        return data;
      }
    } catch {
      // parse failed, try next occurrence
    }

    idx = end;
  }
}

export function transformGlomarkProducts(
  rawProducts: GlomarkRawProduct[],
  options: { capturedAt?: string; sourceStatus?: SourceStatus } = {}
): GlomarkImportedSnapshot {
  return {
    provider: "glomark",
    category: "meat",
    extraction_mode: "worker_fetch",
    captured_at: options.capturedAt ?? new Date().toISOString(),
    source_status: options.sourceStatus ?? "ok",
    items: rawProducts.map(toSnapshotItem),
  };
}

/**
 * Fetch Glomark category page and extract product data.
 * Designed to run inside a Cloudflare Worker (uses standard fetch).
 */
export async function fetchGlomarkCategory(
  category: string = "meat"
): Promise<GlomarkImportedSnapshot> {
  const path = CATEGORY_PATHS[category];
  if (!path) {
    return {
      provider: "glomark",
      category: "meat",
      extraction_mode: "worker_fetch",
      captured_at: new Date().toISOString(),
      source_status: "not_found",
      items: [],
    };
  }

  const url = `${GLOMARK_BASE}${path}`;
  const response = await fetch(url, {
    headers: { "User-Agent": "SLGroceryPriceCompare/1.0" },
  });

  if (!response.ok) {
    return {
      provider: "glomark",
      category: "meat",
      extraction_mode: "worker_fetch",
      captured_at: new Date().toISOString(),
      source_status: "blocked_or_unstable",
      items: [],
    };
  }

  const html = await response.text();
  const rawProducts = extractProductListFromHtml(html);

  if (rawProducts.length === 0) {
    return {
      provider: "glomark",
      category: "meat",
      extraction_mode: "worker_fetch",
      captured_at: new Date().toISOString(),
      source_status: "not_found",
      items: [],
    };
  }

  return transformGlomarkProducts(rawProducts);
}
