#!/usr/bin/env node
/**
 * Test Keells API pagination by extracting session from Puppeteer and calling the API directly.
 */
import puppeteerExtra from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteerExtra.use(StealthPlugin());

const API_URL = "https://zebraliveback.keellssuper.com/2.0/WebV2/GetItemDetails";

const browser = await puppeteerExtra.launch({ headless: true, defaultViewport: { width: 1280, height: 900 } });
const page = await browser.newPage();

// Capture the session ID and cookies from the real page load
let sessionId = null;
page.on("response", async (resp) => {
  if (!resp.url().includes("GuestLogin") || resp.status() !== 200) return;
  try {
    const data = await resp.json();
    sessionId = data.result?.userSessionID;
  } catch {}
});

console.log("Loading Keells to establish session...");
await page.goto("https://www.keellssuper.com/keells-meat-shop", { waitUntil: "domcontentloaded", timeout: 60000 });
await new Promise((r) => setTimeout(r, 10000));

console.log(`Session ID: ${sessionId}\n`);

// Now call the API from within page context with different params
const tests = [
  { label: "Page 1, 12 items", pageNo: 1, itemsPerPage: 12 },
  { label: "Page 2, 12 items", pageNo: 2, itemsPerPage: 12 },
  { label: "Page 1, 24 items", pageNo: 1, itemsPerPage: 24 },
  { label: "Page 1, 100 items (all at once?)", pageNo: 1, itemsPerPage: 100 },
];

for (const t of tests) {
  const result = await page.evaluate(async (apiUrl, params, sid) => {
    const url = new URL(apiUrl);
    url.searchParams.set("pageNo", params.pageNo);
    url.searchParams.set("itemsPerPage", params.itemsPerPage);
    url.searchParams.set("outletCode", "SCDR");
    url.searchParams.set("departmentId", "12");
    url.searchParams.set("subDepartmentId", "");
    url.searchParams.set("categoryId", "");
    url.searchParams.set("itemDescription", "");
    url.searchParams.set("itemPricefrom", "0");
    url.searchParams.set("itemPriceTo", "5000");
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
        "usersessionid": sid || "",
        "x-frame-options": "DENY",
      },
      credentials: "include",
    });

    const data = await resp.json();
    const items = data.result?.itemDetailResult?.itemDetails || [];
    const pageCount = data.result?.itemDetailResult?.pageCount || 0;
    const names = items.map((i) => i.name);
    return { status: resp.status, pageCount, itemCount: items.length, names };
  }, API_URL, t, sessionId);

  console.log(`${t.label}:`);
  console.log(`  Status: ${result.status} | Items: ${result.itemCount} | Total pages: ${result.pageCount}`);
  console.log(`  Products: ${result.names.join(", ")}`);
  console.log();
}

await browser.close();
