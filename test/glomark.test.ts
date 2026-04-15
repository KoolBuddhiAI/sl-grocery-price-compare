import test from "node:test";
import assert from "node:assert/strict";

import { normalizeGlomarkProduct, parsePackSize, computePricePerKgLkr } from "../src/normalize.ts";
import {
  getImportedGlomarkMeatProducts,
  parseGlomarkImportedSnapshot,
} from "../src/providers/glomark.import.ts";
import { extractProductListFromHtml, transformGlomarkProducts } from "../src/adapters/glomark.fetch.ts";

// --- Snapshot validation ---

test("parseGlomarkImportedSnapshot rejects invalid shapes", () => {
  assert.equal(parseGlomarkImportedSnapshot(null), null);
  assert.equal(parseGlomarkImportedSnapshot({}), null);
  assert.equal(parseGlomarkImportedSnapshot({ provider: "glomark" }), null);
  assert.equal(parseGlomarkImportedSnapshot({ provider: "keells", category: "meat" }), null);
});

test("parseGlomarkImportedSnapshot accepts valid snapshot", () => {
  const valid = {
    provider: "glomark",
    category: "meat",
    extraction_mode: "worker_fetch",
    captured_at: "2026-04-15T00:00:00.000Z",
    source_status: "ok",
    items: [
      {
        id: "glomark-9154",
        source_product_id: "340016",
        name: "Chicken Breast",
        source_url: "https://glomark.lk/chicken-breast/p/9154",
        displayed_price_lkr: 564,
        raw_size_text: "300g",
        in_stock: true,
        brand: "GLOMARK",
        sub_category: "Poultry",
      },
    ],
  };
  const snapshot = parseGlomarkImportedSnapshot(valid);
  assert.ok(snapshot);
  assert.equal(snapshot.items.length, 1);
  assert.equal(snapshot.items[0].name, "Chicken Breast");
});

// --- Import from checked-in data ---

test("getImportedGlomarkMeatProducts loads and normalizes checked-in snapshot", () => {
  const products = getImportedGlomarkMeatProducts();

  assert.ok(products);
  assert.ok(products.length > 0, "should have at least one product");
  assert.equal(products[0]?.store, "glomark");
  assert.equal(products[0]?.displayed_currency, "LKR");
  assert.equal(products[0]?.source_category, "meat");
});

test("Glomark products have weight data and unit prices", () => {
  const products = getImportedGlomarkMeatProducts();
  assert.ok(products);

  // Find a weight-based product (unit: "g")
  const weightProduct = products.find((p) => p.net_weight_g !== null);
  assert.ok(weightProduct, "should have at least one product with weight");
  assert.ok(weightProduct.net_weight_g! > 0);
  assert.ok(weightProduct.price_per_kg_lkr !== null, "weight-based product should have price_per_kg");
});

// --- Normalization ---

test("normalizeGlomarkProduct sets store to glomark", () => {
  const product = normalizeGlomarkProduct({
    id: "glomark-test",
    source_url: "https://glomark.lk/test/p/1",
    captured_at: "2026-04-15T00:00:00.000Z",
    source_status: "ok",
    name: "Test Chicken",
    displayed_price_lkr: 564,
    raw_size_text: "300g",
  });

  assert.equal(product.store, "glomark");
  assert.equal(product.name, "Test Chicken");
  assert.equal(product.net_weight_g, 300);
  assert.equal(product.price_per_kg_lkr, 1880);
});

// --- HTML extraction ---

test("extractProductListFromHtml extracts products from Glomark HTML", () => {
  const fakeHtml = `
    <html>
    <script>
      productList = [];
      var quickSearchLists = {};
    </script>
    <script>
      productList = [{"id":9154,"name":"Chicken Breast","price":564,"displayQuantity":300,"unit":"g","isOutOfStock":false,"erpCode":"340016","applicablePrice":564,"brandDetails":{"name":"GLOMARK"},"subCategoryDetails":{"name":"Poultry"}}];
      productCount = productList.length;
    </script>
    </html>
  `;

  const products = extractProductListFromHtml(fakeHtml);
  assert.equal(products.length, 1);
  assert.equal(products[0].name, "Chicken Breast");
  assert.equal(products[0].price, 564);
  assert.equal(products[0].displayQuantity, 300);
  assert.equal(products[0].unit, "g");
});

test("extractProductListFromHtml returns empty array for missing productList", () => {
  const products = extractProductListFromHtml("<html><body>No products here</body></html>");
  assert.deepEqual(products, []);
});

// --- Transform ---

test("transformGlomarkProducts creates valid snapshot from raw data", () => {
  const raw = [
    {
      id: 9154,
      name: "Chicken Breast",
      erpCode: "340016",
      price: 564,
      promoPrice: 564,
      applicablePrice: 564,
      displayQuantity: 300,
      unit: "g",
      stock: 100,
      isOutOfStock: false,
      image: "340016--01--1549602521.jpeg",
      brandDetails: { name: "GLOMARK" },
      subCategoryDetails: { name: "Poultry" },
    },
    {
      id: 64311,
      name: "Crispy Popcorn",
      erpCode: "340281",
      price: 3640,
      promoPrice: 3640,
      applicablePrice: 3640,
      displayQuantity: 1,
      unit: "unit",
      stock: 116,
      isOutOfStock: false,
      image: "340281--01--1698050743.jpeg",
      brandDetails: { name: "GLOMARK" },
      subCategoryDetails: { name: "Ready To Cook" },
    },
  ];

  const snapshot = transformGlomarkProducts(raw, {
    capturedAt: "2026-04-15T00:00:00.000Z",
    sourceStatus: "ok",
  });

  assert.equal(snapshot.provider, "glomark");
  assert.equal(snapshot.items.length, 2);

  // Weight-based product
  assert.equal(snapshot.items[0].name, "Chicken Breast");
  assert.equal(snapshot.items[0].displayed_price_lkr, 564);
  assert.equal(snapshot.items[0].raw_size_text, "300g");
  assert.equal(snapshot.items[0].in_stock, true);
  assert.equal(snapshot.items[0].brand, "GLOMARK");

  // Unit-based product (no weight)
  assert.equal(snapshot.items[1].name, "Crispy Popcorn");
  assert.equal(snapshot.items[1].raw_size_text, null);

  // Validate it passes snapshot parser
  const parsed = parseGlomarkImportedSnapshot(snapshot);
  assert.ok(parsed, "transformed snapshot should pass validation");
});

// --- Unit price computation for Glomark products ---

test("Glomark unit price: 564 LKR for 300g = 1880/kg", () => {
  assert.equal(computePricePerKgLkr(564, 300), 1880);
});

test("Glomark unit price: 2210 LKR for 1300g = 1700/kg", () => {
  assert.equal(computePricePerKgLkr(2210, 1300), 1700);
});

test("Glomark unit price: null for unit-based products", () => {
  assert.equal(computePricePerKgLkr(3640, null), null);
});
