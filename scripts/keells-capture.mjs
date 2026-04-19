#!/usr/bin/env node

/**
 * Automated Keells price capture using Puppeteer + stealth.
 *
 * Establishes a browser session to bypass Cloudflare, then calls the Keells
 * product API directly with itemsPerPage=200 to get all products in one shot.
 *
 * Usage:
 *   npm run keells:capture                       # headed browser, meat category
 *   npm run keells:capture -- --headless          # headless mode
 *   npm run keells:capture -- --dry-run           # preview without writing
 *   npm run keells:capture -- --category seafood  # different category
 *   npm run keells:capture -- --headless --push   # capture and push to Worker
 *   npm run keells:capture -- --push --push-url https://... --push-key SECRET
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import puppeteerExtra from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteerExtra.use(StealthPlugin());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
function importFile(category) {
  return path.join(PROJECT_ROOT, "data", `keells.${category}.import.json`);
}
function rawCaptureFile(category) {
  return path.join(PROJECT_ROOT, "data", `keells.${category}.browser-raw.capture.json`);
}

const { transformRawKeellsRecords } = await import("./keells-browser-export.mjs");

const KEELLS_BASE = "https://www.keellssuper.com";
const API_URL = "https://zebraliveback.keellssuper.com/2.0/WebV2/GetItemDetails";

// Department IDs and slugs from the Keells API
const CATEGORIES = {
  meat:       { id: 12, slug: "keells-meat-shop" },
  seafood:    { id: 4,  slug: "fresh-fish" },
  vegetables: { id: 16, slug: "fresh-vegetables" },
  fruits:     { id: 6,  slug: "fresh-fruits" },
  beverages:  { id: 2,  slug: "beverages" },
};

function parseArgs(argv) {
  const options = {
    headless: false,
    dryRun: false,
    category: "meat",
    sourceStatus: "ok",
    push: false,
    pushUrl: null,
    pushKey: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--headless") options.headless = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--category") options.category = argv[++i];
    else if (arg === "--source-status") options.sourceStatus = argv[++i];
    else if (arg === "--push") options.push = true;
    else if (arg === "--push-url") options.pushUrl = argv[++i];
    else if (arg === "--push-key") options.pushKey = argv[++i];
  }

  return options;
}

function normalizeApiItem(item) {
  const name = item.name || item.itemName || "";
  const price = item.amount ?? item.sellingPrice ?? null;
  const productId = item.itemCode || null;
  const uom = item.uom || null; // "KG" = per kg, "NO" = per unit/piece

  let inStock = null;
  if (item.isOutOfStock === true) inStock = false;
  else if (item.isOutOfStock === false) inStock = true;
  else if (item.maxQty != null) inStock = item.maxQty > 0;

  const url = productId ? `${KEELLS_BASE}/product/${productId}` : KEELLS_BASE;

  return {
    ...(productId ? { productId } : {}),
    name,
    url,
    ...(price != null ? { price } : {}),
    ...(uom ? { uom } : {}),
    ...(inStock != null ? { inStock } : {}),
    notes: "Captured from Keells API via automated Puppeteer session.",
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const cat = CATEGORIES[options.category];

  if (!cat) {
    console.error(`Unknown category: ${options.category}`);
    console.error(`Available: ${Object.keys(CATEGORIES).join(", ")}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Category: ${options.category} (dept ID: ${cat.id})`);
  console.log(`Mode:     ${options.headless ? "headless" : "headed"} | dry-run: ${options.dryRun}`);
  console.log();

  const browser = await puppeteerExtra.launch({
    headless: options.headless,
    defaultViewport: { width: 1280, height: 900 },
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  let products = [];

  try {
    const page = await browser.newPage();

    // Capture session ID from GuestLogin
    let sessionId = null;
    page.on("response", async (resp) => {
      if (!resp.url().includes("GuestLogin") || resp.status() !== 200) return;
      try {
        const data = await resp.json();
        sessionId = data.result?.userSessionID;
      } catch {}
    });

    // Navigate to establish Cloudflare clearance + session
    console.log("Establishing session...");
    await page.goto(`${KEELLS_BASE}/${cat.slug}`, { waitUntil: "domcontentloaded", timeout: 60000 });

    // Wait for session
    const maxWait = 30000;
    const start = Date.now();
    while (!sessionId && Date.now() - start < maxWait) {
      await new Promise((r) => setTimeout(r, 1000));
    }

    if (!sessionId) {
      console.error("Failed to establish session. Cloudflare may be blocking.");
      const screenshotPath = path.join(PROJECT_ROOT, "data", "keells-debug-screenshot.png");
      await page.screenshot({ path: screenshotPath, fullPage: true });
      process.exitCode = 1;
      return;
    }

    console.log(`Session: ${sessionId}`);

    // Call the product API directly from within the page context
    // Using itemsPerPage=200 to get all products in a single request
    console.log("Fetching all products...");
    const apiResult = await page.evaluate(async (apiUrl, deptId, sid) => {
      const url = new URL(apiUrl);
      url.searchParams.set("pageNo", "1");
      url.searchParams.set("itemsPerPage", "200");
      url.searchParams.set("outletCode", "SCDR");
      url.searchParams.set("departmentId", String(deptId));
      url.searchParams.set("subDepartmentId", "");
      url.searchParams.set("categoryId", "");
      url.searchParams.set("itemDescription", "");
      url.searchParams.set("itemPricefrom", "0");
      url.searchParams.set("itemPriceTo", "99999");
      url.searchParams.set("isFeatured", "0");
      url.searchParams.set("isPromotionOnly", "false");
      url.searchParams.set("promotionCategory", "");
      url.searchParams.set("sortBy", "default");
      url.searchParams.set("BrandId", "");
      url.searchParams.set("storeName", "");
      url.searchParams.set("subDeaprtmentCode", "");
      url.searchParams.set("isShowOutofStockItems", "true");
      url.searchParams.set("brandName", "");

      const resp = await fetch(url.toString(), {
        headers: {
          "accept": "application/json",
          "usersessionid": sid,
          "x-frame-options": "DENY",
        },
        credentials: "include",
      });

      const data = await resp.json();
      return {
        status: resp.status,
        items: data.result?.itemDetailResult?.itemDetails || [],
        pageCount: data.result?.itemDetailResult?.pageCount || 0,
      };
    }, API_URL, cat.id, sessionId);

    if (apiResult.status !== 200) {
      console.error(`API returned status ${apiResult.status}`);
      process.exitCode = 1;
      return;
    }

    products = apiResult.items.map(normalizeApiItem).filter((p) => p.name);
    console.log(`Captured ${products.length} products (${apiResult.pageCount} page(s) at API level).`);
  } finally {
    await browser.close();
  }

  if (products.length === 0) {
    console.error("\nNo products captured.");
    process.exitCode = 1;
    return;
  }

  // Save raw capture
  await fs.writeFile(rawCaptureFile(options.category), `${JSON.stringify(products, null, 2)}\n`, "utf8");
  console.log(`Raw capture saved to: ${path.relative(PROJECT_ROOT, rawCaptureFile(options.category))}`);

  // Transform
  const snapshot = transformRawKeellsRecords(products, {
    capturedAt: new Date().toISOString(),
    sourceStatus: options.sourceStatus,
    category: options.category,
  });
  console.log(`Transformed ${snapshot.items.length} items.`);

  if (options.dryRun) {
    console.log("\n--- DRY RUN ---\n");
    console.log(JSON.stringify(snapshot, null, 2));
    return;
  }

  // Write import file
  await fs.writeFile(importFile(options.category), `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  console.log(`Wrote snapshot to: ${path.relative(PROJECT_ROOT, importFile(options.category))}`);

  // Push snapshot to Worker
  if (options.push) {
    const pushUrl = options.pushUrl || process.env.WORKER_URL;
    const pushKey = options.pushKey || process.env.SNAPSHOT_API_KEY;

    if (!pushUrl || !pushKey) {
      console.error("--push requires WORKER_URL and SNAPSHOT_API_KEY (via flags or env vars)");
      process.exitCode = 1;
      return;
    }

    console.log(`Pushing snapshot to ${pushUrl}/api/snapshots...`);

    const maxAttempts = 3;
    let resp = null;
    let lastError = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        resp = await fetch(`${pushUrl}/api/snapshots`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${pushKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(snapshot),
        });
        break;
      } catch (err) {
        lastError = err;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Push attempt ${attempt}/${maxAttempts} failed: ${msg}`);
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 2000 * attempt));
        }
      }
    }

    if (!resp) {
      console.error(`Push failed after ${maxAttempts} attempts: ${lastError}`);
      process.exitCode = 1;
      return;
    }

    if (resp.ok) {
      const result = await resp.json();
      console.log(`Pushed: ${result.items} items to ${result.provider}/${result.category}`);
    } else {
      console.error(`Push failed: ${resp.status} ${resp.statusText}`);
      const text = await resp.text();
      if (text) console.error(text);
      process.exitCode = 1;
      return;
    }
  }

  // Run tests
  console.log("\nRunning tests...\n");
  try {
    execSync("node --test", { cwd: PROJECT_ROOT, stdio: "inherit" });
    console.log("\nDone. All tests passed.");
  } catch {
    console.error("\nSome tests failed.");
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
