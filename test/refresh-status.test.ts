import test from "node:test";
import assert from "node:assert/strict";

import { mergeRefreshStatusRecord } from "../src/kv-helpers.ts";
import { requireProductListFromHtml } from "../src/adapters/glomark.fetch.ts";
import { parseCargillsProductsResponse } from "../src/adapters/cargills.fetch.ts";

test("mergeRefreshStatusRecord preserves last success across failed attempts", () => {
  const afterSuccess = mergeRefreshStatusRecord(null, {
    provider: "glomark",
    category: "meat",
    attempted_at: "2026-04-25T10:00:00.000Z",
    source_status: "ok",
    item_count: 42,
    message: "glomark: fetched 42 items and updated snapshot",
    success: true,
  });

  const afterFailure = mergeRefreshStatusRecord(afterSuccess, {
    provider: "glomark",
    category: "meat",
    attempted_at: "2026-04-26T10:00:00.000Z",
    source_status: "not_found",
    item_count: 0,
    message: "glomark: productList missing from HTML",
    success: false,
  });

  assert.equal(afterFailure.last_attempted_at, "2026-04-26T10:00:00.000Z");
  assert.equal(afterFailure.last_attempt_success, false);
  assert.equal(afterFailure.last_successful_at, "2026-04-25T10:00:00.000Z");
  assert.equal(afterFailure.last_success_item_count, 42);
  assert.equal(afterFailure.last_error_message, "glomark: productList missing from HTML");
  assert.equal(afterFailure.last_error_at, "2026-04-26T10:00:00.000Z");
});

test("requireProductListFromHtml throws a stage-specific error", () => {
  assert.throws(
    () => requireProductListFromHtml("<html><body>No products here</body></html>"),
    /glomark: productList missing from HTML/
  );
});

test("parseCargillsProductsResponse throws a stage-specific parse error", () => {
  assert.throws(
    () => parseCargillsProductsResponse("not json"),
    /cargills: JSON parse failed/
  );
});
