import importedSnapshot from "../../data/keells.meat.import.json" with { type: "json" };

import { normalizeKeellsProduct } from "../normalize.ts";
import type { KeellsImportedSnapshot, KeellsImportedSnapshotItem, NormalizedProduct } from "../schema.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNullableString(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

function isSnapshotItem(value: unknown): value is KeellsImportedSnapshotItem {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isNullableString(value.source_product_id) &&
    typeof value.name === "string" &&
    typeof value.source_url === "string" &&
    (typeof value.displayed_price_lkr === "number" || value.displayed_price_lkr === null) &&
    isNullableString(value.raw_size_text) &&
    (typeof value.in_stock === "boolean" || value.in_stock === null) &&
    (value.notes === undefined || isNullableString(value.notes))
  );
}

export function parseKeellsImportedSnapshot(value: unknown): KeellsImportedSnapshot | null {
  if (
    !isRecord(value) ||
    value.provider !== "keells" ||
    value.category !== "meat" ||
    value.extraction_mode !== "browser_assisted" ||
    typeof value.captured_at !== "string" ||
    !["ok", "partial", "blocked_or_unstable", "not_found"].includes(String(value.source_status)) ||
    !Array.isArray(value.items) ||
    !value.items.every(isSnapshotItem)
  ) {
    return null;
  }

  return value as KeellsImportedSnapshot;
}

export function normalizeKeellsImportedSnapshot(snapshot: KeellsImportedSnapshot): NormalizedProduct[] {
  return snapshot.items.map((item) =>
    normalizeKeellsProduct({
      id: item.id,
      source_url: item.source_url,
      source_product_id: item.source_product_id,
      captured_at: snapshot.captured_at,
      source_status: snapshot.source_status,
      name: item.name,
      displayed_price_lkr: item.displayed_price_lkr,
      in_stock: item.in_stock,
      raw_size_text: item.raw_size_text,
      notes: item.notes ?? "Imported from a browser-assisted Keells snapshot export.",
      price_is_per_kg: !item.raw_size_text,
    })
  );
}

export function getImportedKeellsMeatProducts(): NormalizedProduct[] | null {
  const snapshot = parseKeellsImportedSnapshot(importedSnapshot);

  if (!snapshot || snapshot.items.length === 0) {
    return null;
  }

  return normalizeKeellsImportedSnapshot(snapshot);
}

export function getImportedKeellsSnapshotMeta():
  | Pick<KeellsImportedSnapshot, "captured_at" | "extraction_mode" | "source_status">
  | null {
  const snapshot = parseKeellsImportedSnapshot(importedSnapshot);
  if (!snapshot || snapshot.items.length === 0) {
    return null;
  }

  return {
    captured_at: snapshot.captured_at,
    extraction_mode: snapshot.extraction_mode,
    source_status: snapshot.source_status
  };
}
