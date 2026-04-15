import type { CargillsImportedSnapshot, CargillsImportedSnapshotItem, SourceStatus } from "../schema.ts";

const CARGILLS_BASE = "https://cargillsonline.com";

const CATEGORY_IDS: Record<string, number> = {
  meat: 11,
  vegetables: 23,
};

type CargillsRawProduct = {
  ItemName: string;
  Price: string;
  Mrp: string;
  DiscountAmount: string;
  SKUCODE: string;
  UnitSize: number;
  UOM: string;
  Inventory: number;
  ItemImage: string;
  CategoryCode: string;
  EnId: string;
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildSizeText(unitSize: number, uom: string): string | null {
  if (!unitSize || !uom) return null;
  const normalizedUom = uom.trim().toLowerCase();
  if (["g", "kg", "ml", "l"].includes(normalizedUom)) {
    return `${unitSize}${normalizedUom}`;
  }
  return `${unitSize} ${uom}`;
}

function parsePrice(priceStr: string): number | null {
  // Cargills prices may contain commas: "1,192.00"
  const cleaned = priceStr.replace(/,/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function toSnapshotItem(raw: CargillsRawProduct): CargillsImportedSnapshotItem {
  const productId = raw.EnId || raw.SKUCODE;
  const slug = slugify(raw.ItemName);

  return {
    id: `cargills-${raw.SKUCODE}`,
    source_product_id: raw.SKUCODE,
    name: raw.ItemName,
    source_url: `${CARGILLS_BASE}/Web/Product/${slug}/${productId}`,
    displayed_price_lkr: parsePrice(raw.Price),
    raw_size_text: buildSizeText(raw.UnitSize, raw.UOM),
    in_stock: raw.Inventory > 0,
    sku_code: raw.SKUCODE,
    category_code: raw.CategoryCode,
    notes: null,
  };
}

/**
 * Extract cookies from Set-Cookie response headers.
 * Returns a cookie string suitable for the Cookie header.
 */
export function extractCookies(response: Response): string {
  const cookies: string[] = [];
  // In Workers, response.headers.getSetCookie() returns an array of Set-Cookie values
  // Fallback: use getAll if available, otherwise parse from get
  const setCookieHeaders: string[] = [];

  if (typeof response.headers.getSetCookie === "function") {
    setCookieHeaders.push(...response.headers.getSetCookie());
  } else {
    // Fallback for environments without getSetCookie
    const raw = response.headers.get("set-cookie");
    if (raw) {
      setCookieHeaders.push(...raw.split(/,(?=\s*\w+=)/));
    }
  }

  for (const header of setCookieHeaders) {
    // Extract just the cookie name=value part (before first ;)
    const nameValue = header.split(";")[0].trim();
    if (nameValue) {
      cookies.push(nameValue);
    }
  }

  return cookies.join("; ");
}

/**
 * Encode a category ID to base64 for the Cargills API.
 */
export function encodeCategoryId(id: number): string {
  return btoa(String(id));
}

export function transformCargillsProducts(
  rawProducts: CargillsRawProduct[],
  options: { capturedAt?: string; sourceStatus?: SourceStatus } = {}
): CargillsImportedSnapshot {
  return {
    provider: "cargills",
    category: "meat",
    extraction_mode: "worker_fetch",
    captured_at: options.capturedAt ?? new Date().toISOString(),
    source_status: options.sourceStatus ?? "ok",
    items: rawProducts.map(toSnapshotItem),
  };
}

/**
 * Bootstrap a session with Cargills and return the session cookies.
 */
async function bootstrapSession(): Promise<string> {
  const response = await fetch(`${CARGILLS_BASE}/Web/CheckDeliveryOptionV1`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "SLGroceryPriceCompare/1.0",
    },
    body: "PinCode=Colombo",
  });

  if (!response.ok) {
    throw new Error(`Session bootstrap failed: ${response.status}`);
  }

  // Consume the response body
  await response.text();

  return extractCookies(response);
}

/**
 * Fetch Cargills category products using the session cookies.
 * Designed to run inside a Cloudflare Worker (uses standard fetch).
 */
export async function fetchCargillsCategory(
  category: string = "meat"
): Promise<CargillsImportedSnapshot> {
  const categoryId = CATEGORY_IDS[category];
  if (categoryId === undefined) {
    return {
      provider: "cargills",
      category: "meat",
      extraction_mode: "worker_fetch",
      captured_at: new Date().toISOString(),
      source_status: "not_found",
      items: [],
    };
  }

  let cookies: string;
  try {
    cookies = await bootstrapSession();
  } catch {
    return {
      provider: "cargills",
      category: "meat",
      extraction_mode: "worker_fetch",
      captured_at: new Date().toISOString(),
      source_status: "blocked_or_unstable",
      items: [],
    };
  }

  const encodedId = encodeCategoryId(categoryId);
  const body = `CategoryId=${encodeURIComponent(encodedId)}&Search=&Filter=&PageIndex=1&PageSize=100&BannerId=&SectionId=&CollectionId=&SectionType=&DataType=&SubCatId=&PromoId=`;

  const response = await fetch(`${CARGILLS_BASE}/Web/GetMenuCategoryItemsPagingV3/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "SLGroceryPriceCompare/1.0",
      Cookie: cookies,
    },
    body,
  });

  if (!response.ok) {
    return {
      provider: "cargills",
      category: "meat",
      extraction_mode: "worker_fetch",
      captured_at: new Date().toISOString(),
      source_status: "blocked_or_unstable",
      items: [],
    };
  }

  let rawProducts: CargillsRawProduct[];
  try {
    rawProducts = await response.json() as CargillsRawProduct[];
  } catch {
    return {
      provider: "cargills",
      category: "meat",
      extraction_mode: "worker_fetch",
      captured_at: new Date().toISOString(),
      source_status: "blocked_or_unstable",
      items: [],
    };
  }

  if (!Array.isArray(rawProducts) || rawProducts.length === 0) {
    return {
      provider: "cargills",
      category: "meat",
      extraction_mode: "worker_fetch",
      captured_at: new Date().toISOString(),
      source_status: "not_found",
      items: [],
    };
  }

  return transformCargillsProducts(rawProducts);
}
