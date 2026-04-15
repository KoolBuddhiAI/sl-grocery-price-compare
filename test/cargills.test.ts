import test from "node:test";
import assert from "node:assert/strict";

import { normalizeCargillsProduct, parsePackSize, computePricePerKgLkr } from "../src/normalize.ts";
import {
  parseCargillsImportedSnapshot,
} from "../src/providers/cargills.import.ts";
import { extractCookies, encodeCategoryId, transformCargillsProducts } from "../src/adapters/cargills.fetch.ts";

// --- Snapshot validation ---

test("parseCargillsImportedSnapshot rejects invalid shapes", () => {
  assert.equal(parseCargillsImportedSnapshot(null), null);
  assert.equal(parseCargillsImportedSnapshot({}), null);
  assert.equal(parseCargillsImportedSnapshot({ provider: "cargills" }), null);
  assert.equal(parseCargillsImportedSnapshot({ provider: "keells", category: "meat" }), null);
});

test("parseCargillsImportedSnapshot accepts valid snapshot", () => {
  const valid = {
    provider: "cargills",
    category: "meat",
    extraction_mode: "worker_fetch",
    captured_at: "2026-04-15T00:00:00.000Z",
    source_status: "ok",
    items: [
      {
        id: "cargills-MT001",
        source_product_id: "MT001",
        name: "Chicken Breast 500g",
        source_url: "https://cargillsonline.com/Web/Product/chicken-breast-500g/abc123",
        displayed_price_lkr: 790,
        raw_size_text: "500g",
        in_stock: true,
        sku_code: "MT001",
        category_code: "MT",
      },
    ],
  };
  const snapshot = parseCargillsImportedSnapshot(valid);
  assert.ok(snapshot);
  assert.equal(snapshot.items.length, 1);
  assert.equal(snapshot.items[0].name, "Chicken Breast 500g");
});

test("parseCargillsImportedSnapshot accepts empty items array", () => {
  const valid = {
    provider: "cargills",
    category: "meat",
    extraction_mode: "worker_fetch",
    captured_at: "2026-04-15T00:00:00.000Z",
    source_status: "not_found",
    items: [],
  };
  const snapshot = parseCargillsImportedSnapshot(valid);
  assert.ok(snapshot);
  assert.equal(snapshot.items.length, 0);
});

// --- Normalization ---

test("normalizeCargillsProduct sets store to cargills", () => {
  const product = normalizeCargillsProduct({
    id: "cargills-test",
    source_url: "https://cargillsonline.com/Web/Product/test/abc",
    captured_at: "2026-04-15T00:00:00.000Z",
    source_status: "ok",
    name: "Test Chicken",
    displayed_price_lkr: 790,
    raw_size_text: "500g",
  });

  assert.equal(product.store, "cargills");
  assert.equal(product.name, "Test Chicken");
  assert.equal(product.net_weight_g, 500);
  assert.equal(product.price_per_kg_lkr, 1580);
});

// --- Unit price computation for Cargills products ---

test("Cargills unit price: 790 LKR for 500g = 1580/kg", () => {
  assert.equal(computePricePerKgLkr(790, 500), 1580);
});

test("Cargills unit price: 1500 LKR for 1000g = 1500/kg", () => {
  assert.equal(computePricePerKgLkr(1500, 1000), 1500);
});

test("Cargills unit price: null for null weight", () => {
  assert.equal(computePricePerKgLkr(790, null), null);
});

// --- Transform ---

test("transformCargillsProducts creates valid snapshot from raw data", () => {
  const raw = [
    {
      ItemName: "Chicken Breast 500g",
      Price: "790.00",
      Mrp: "0.00",
      DiscountAmount: "0.00%",
      SKUCODE: "MT001",
      UnitSize: 500,
      UOM: "g",
      Inventory: 50,
      ItemImage: "/images/MT001.jpg",
      CategoryCode: "MT",
      EnId: "abc123",
    },
    {
      ItemName: "Beef Mince 1Kg",
      Price: "1850.00",
      Mrp: "1900.00",
      DiscountAmount: "2.63%",
      SKUCODE: "MT002",
      UnitSize: 1,
      UOM: "Kg",
      Inventory: 0,
      ItemImage: "/images/MT002.jpg",
      CategoryCode: "MT",
      EnId: "def456",
    },
  ];

  const snapshot = transformCargillsProducts(raw, {
    capturedAt: "2026-04-15T00:00:00.000Z",
    sourceStatus: "ok",
  });

  assert.equal(snapshot.provider, "cargills");
  assert.equal(snapshot.items.length, 2);

  // Weight-based product (grams)
  assert.equal(snapshot.items[0].name, "Chicken Breast 500g");
  assert.equal(snapshot.items[0].displayed_price_lkr, 790);
  assert.equal(snapshot.items[0].raw_size_text, "500g");
  assert.equal(snapshot.items[0].in_stock, true);
  assert.equal(snapshot.items[0].sku_code, "MT001");

  // Out of stock product (kg)
  assert.equal(snapshot.items[1].name, "Beef Mince 1Kg");
  assert.equal(snapshot.items[1].displayed_price_lkr, 1850);
  assert.equal(snapshot.items[1].raw_size_text, "1kg");
  assert.equal(snapshot.items[1].in_stock, false);

  // Validate it passes snapshot parser
  const parsed = parseCargillsImportedSnapshot(snapshot);
  assert.ok(parsed, "transformed snapshot should pass validation");
});

// --- Cookie extraction ---

test("extractCookies extracts cookies from Set-Cookie headers", () => {
  const headers = new Headers();
  headers.append("set-cookie", "ASP.NET_SessionId=abc123; path=/; HttpOnly");
  headers.append("set-cookie", "ASP.NET_Pincode=Colombo; path=/");

  // Create a mock response with these headers
  const response = new Response("", { headers });
  const cookies = extractCookies(response);

  // The exact format depends on the runtime, but should contain both cookies
  assert.ok(cookies.includes("ASP.NET_SessionId=abc123"), `cookies should include SessionId, got: ${cookies}`);
  assert.ok(cookies.includes("ASP.NET_Pincode=Colombo"), `cookies should include Pincode, got: ${cookies}`);
});

// --- Price parsing with commas ---

test("transformCargillsProducts handles comma-separated prices", () => {
  const raw = [
    {
      ItemName: "Goldi Kochchi Chicken Sausages",
      Price: "1,192.00",
      Mrp: "0.00",
      DiscountAmount: "",
      SKUCODE: "FFE0289",
      UnitSize: 600,
      UOM: "g",
      Inventory: 19,
      ItemImage: "/images/FFE0289.jpg",
      CategoryCode: "MT",
      EnId: "abc123",
    },
  ];

  const snapshot = transformCargillsProducts(raw, {
    capturedAt: "2026-04-15T00:00:00.000Z",
    sourceStatus: "ok",
  });

  assert.equal(snapshot.items[0].displayed_price_lkr, 1192);
});

// --- Base64 category ID encoding ---

test("encodeCategoryId encodes integer to base64", () => {
  assert.equal(encodeCategoryId(11), "MTE=");
  assert.equal(encodeCategoryId(23), "MjM=");
  assert.equal(encodeCategoryId(1), "MQ==");
});
