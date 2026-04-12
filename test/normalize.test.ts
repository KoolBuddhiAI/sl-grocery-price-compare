import test from "node:test";
import assert from "node:assert/strict";

import { computePricePerKgLkr, normalizeKeellsProduct, parsePackSize } from "../src/normalize.ts";

test("parsePackSize handles gram and kilogram variations", () => {
  assert.deepEqual(parsePackSize("300g"), {
    pack_qty: 300,
    pack_unit: "g",
    net_weight_g: 300,
    raw_size_text: "300g"
  });

  assert.deepEqual(parsePackSize("500 g"), {
    pack_qty: 500,
    pack_unit: "g",
    net_weight_g: 500,
    raw_size_text: "500 g"
  });

  assert.deepEqual(parsePackSize("1kg"), {
    pack_qty: 1,
    pack_unit: "kg",
    net_weight_g: 1000,
    raw_size_text: "1kg"
  });

  assert.deepEqual(parsePackSize("1.3kg"), {
    pack_qty: 1.3,
    pack_unit: "kg",
    net_weight_g: 1300,
    raw_size_text: "1.3kg"
  });

  assert.deepEqual(parsePackSize("Per 300g(s)"), {
    pack_qty: 300,
    pack_unit: "g",
    net_weight_g: 300,
    raw_size_text: "Per 300g(s)"
  });
});

test("computePricePerKgLkr returns null without usable weight", () => {
  assert.equal(computePricePerKgLkr(500, null), null);
  assert.equal(computePricePerKgLkr(null, 500), null);
});

test("normalizeKeellsProduct computes price_per_kg_lkr from parsed weight", () => {
  const product = normalizeKeellsProduct({
    id: "seed",
    source_url: "https://example.com",
    captured_at: "2026-04-12T00:00:00.000Z",
    source_status: "partial",
    name: "Seeded Chicken",
    displayed_price_lkr: 720,
    raw_size_text: "Per 300g(s)"
  });

  assert.equal(product.net_weight_g, 300);
  assert.equal(product.price_per_kg_lkr, 2400);
});
