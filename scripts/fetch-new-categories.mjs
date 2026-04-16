#!/usr/bin/env node

/**
 * Fetch Glomark and Cargills data for seafood, vegetables, and fruits categories.
 * Saves snapshot JSON files to the data/ directory.
 *
 * Usage: node scripts/fetch-new-categories.mjs
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(PROJECT_ROOT, "data");

// ---- Glomark ----

const GLOMARK_BASE = "https://glomark.lk";
const GLOMARK_CATEGORIES = {
  seafood: "/fresh/fish/c/146",
  vegetables: "/fresh/vegetable/c/145",
  fruits: "/fresh/fruits/c/147",
};

function extractProductListFromHtml(html) {
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

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function buildGlomarkSizeText(displayQuantity, unit) {
  if (unit === "g") return `${displayQuantity}g`;
  if (unit === "kg") return `${displayQuantity}kg`;
  return null;
}

function toGlomarkSnapshotItem(raw) {
  const productId = String(raw.id);
  const slug = slugify(raw.name);

  return {
    id: `glomark-${productId}`,
    source_product_id: raw.erpCode || productId,
    name: raw.name,
    source_url: `${GLOMARK_BASE}/${slug}/p/${productId}`,
    displayed_price_lkr: raw.applicablePrice ?? raw.price ?? null,
    raw_size_text: buildGlomarkSizeText(raw.displayQuantity, raw.unit),
    in_stock: !raw.isOutOfStock,
    brand: raw.brandDetails?.name ?? null,
    sub_category: raw.subCategoryDetails?.name ?? null,
    notes: null,
  };
}

async function fetchGlomark(category, urlPath) {
  const url = `${GLOMARK_BASE}${urlPath}`;
  console.log(`  Fetching ${url}...`);

  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
  });

  if (!response.ok) {
    console.error(`  HTTP ${response.status} for Glomark ${category}`);
    return null;
  }

  const html = await response.text();
  const rawProducts = extractProductListFromHtml(html);

  if (rawProducts.length === 0) {
    console.error(`  No products found in HTML for Glomark ${category}`);
    return null;
  }

  const capturedAt = new Date().toISOString();
  const snapshot = {
    provider: "glomark",
    category,
    extraction_mode: "worker_fetch",
    captured_at: capturedAt,
    source_status: "ok",
    items: rawProducts.map(toGlomarkSnapshotItem),
  };

  console.log(`  Found ${snapshot.items.length} Glomark ${category} products`);
  return snapshot;
}

// ---- Cargills ----

const CARGILLS_BASE = "https://cargillsonline.com";
const CARGILLS_CATEGORIES = {
  seafood: 19,
  vegetables: 23,
  fruits: 9,
};

function extractCookies(response) {
  const cookies = [];
  const setCookieHeaders = [];

  if (typeof response.headers.getSetCookie === "function") {
    setCookieHeaders.push(...response.headers.getSetCookie());
  } else {
    const raw = response.headers.get("set-cookie");
    if (raw) {
      setCookieHeaders.push(...raw.split(/,(?=\s*\w+=)/));
    }
  }

  for (const header of setCookieHeaders) {
    const nameValue = header.split(";")[0].trim();
    if (nameValue) cookies.push(nameValue);
  }

  return cookies.join("; ");
}

function toCargillsSnapshotItem(raw) {
  const productId = raw.EnId || raw.SKUCODE;
  const slug = slugify(raw.ItemName);

  return {
    id: `cargills-${raw.SKUCODE}`,
    source_product_id: raw.SKUCODE,
    name: raw.ItemName,
    source_url: `${CARGILLS_BASE}/Web/Product/${slug}/${productId}`,
    displayed_price_lkr: parseFloat(raw.Price.replace(/,/g, "")) || null,
    raw_size_text: raw.UnitSize && raw.UOM ? `${raw.UnitSize}${raw.UOM.trim().toLowerCase()}` : null,
    in_stock: raw.Inventory > 0,
    sku_code: raw.SKUCODE,
    category_code: raw.CategoryCode,
    notes: null,
  };
}

async function fetchCargills(category, categoryId) {
  console.log(`  Bootstrapping Cargills session...`);

  const sessionResp = await fetch(`${CARGILLS_BASE}/Web/CheckDeliveryOptionV1`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
    body: "PinCode=Colombo",
  });

  if (!sessionResp.ok) {
    console.error(`  Session bootstrap failed: ${sessionResp.status}`);
    return null;
  }
  await sessionResp.text();

  const cookies = extractCookies(sessionResp);
  const encodedId = btoa(String(categoryId));
  const body = `CategoryId=${encodeURIComponent(encodedId)}&Search=&Filter=&PageIndex=1&PageSize=100&BannerId=&SectionId=&CollectionId=&SectionType=&DataType=&SubCatId=&PromoId=`;

  console.log(`  Fetching Cargills ${category} (CategoryId=${encodedId})...`);

  const response = await fetch(`${CARGILLS_BASE}/Web/GetMenuCategoryItemsPagingV3/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      Cookie: cookies,
    },
    body,
  });

  if (!response.ok) {
    console.error(`  HTTP ${response.status} for Cargills ${category}`);
    return null;
  }

  let rawProducts;
  try {
    rawProducts = await response.json();
  } catch {
    console.error(`  JSON parse failed for Cargills ${category}`);
    return null;
  }

  if (!Array.isArray(rawProducts) || rawProducts.length === 0) {
    console.error(`  No products for Cargills ${category}`);
    return null;
  }

  const capturedAt = new Date().toISOString();
  const snapshot = {
    provider: "cargills",
    category,
    extraction_mode: "worker_fetch",
    captured_at: capturedAt,
    source_status: "ok",
    items: rawProducts.map(toCargillsSnapshotItem),
  };

  console.log(`  Found ${snapshot.items.length} Cargills ${category} products`);
  return snapshot;
}

// ---- Main ----

async function main() {
  console.log("Fetching new category data...\n");

  // Glomark categories
  console.log("=== Glomark ===");
  for (const [category, urlPath] of Object.entries(GLOMARK_CATEGORIES)) {
    const snapshot = await fetchGlomark(category, urlPath);
    if (snapshot) {
      const filePath = path.join(DATA_DIR, `glomark.${category}.import.json`);
      await fs.writeFile(filePath, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
      console.log(`  Saved to ${path.relative(PROJECT_ROOT, filePath)}\n`);
    } else {
      console.log(`  Skipped ${category}\n`);
    }
  }

  // Cargills categories
  console.log("=== Cargills ===");
  for (const [category, categoryId] of Object.entries(CARGILLS_CATEGORIES)) {
    const snapshot = await fetchCargills(category, categoryId);
    if (snapshot) {
      const filePath = path.join(DATA_DIR, `cargills.${category}.import.json`);
      await fs.writeFile(filePath, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
      console.log(`  Saved to ${path.relative(PROJECT_ROOT, filePath)}\n`);
    } else {
      console.log(`  Skipped ${category}\n`);
    }
  }

  console.log("Done.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
