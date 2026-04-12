import test from "node:test";
import assert from "node:assert/strict";

import rawFixture from "../data/keells.browser-raw.sample.json" with { type: "json" };
import expectedSnapshot from "../data/keells.meat.import.from-raw.sample.json" with { type: "json" };
import { parseKeellsImportedSnapshot } from "../src/providers/keells.import.ts";
import { transformRawKeellsRecords } from "../scripts/keells-browser-export.mjs";

test("transformRawKeellsRecords converts browser-captured records into the import contract", () => {
  const snapshot = transformRawKeellsRecords(rawFixture, {
    capturedAt: "2026-04-12T09:00:00.000Z",
    sourceStatus: "ok"
  });

  assert.deepEqual(snapshot, expectedSnapshot);
  assert.deepEqual(parseKeellsImportedSnapshot(snapshot), expectedSnapshot);
});
