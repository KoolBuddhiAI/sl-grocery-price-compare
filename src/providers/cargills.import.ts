import importedSnapshot from "../../data/cargills.meat.import.json" with { type: "json" };

import { normalizeCargillsProduct } from "../normalize.ts";
import type { CargillsImportedSnapshot, CargillsImportedSnapshotItem, NormalizedProduct } from "../schema.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNullableString(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

function isSnapshotItem(value: unknown): value is CargillsImportedSnapshotItem {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isNullableString(value.source_product_id) &&
    typeof value.name === "string" &&
    typeof value.source_url === "string" &&
    (typeof value.displayed_price_lkr === "number" || value.displayed_price_lkr === null) &&
    isNullableString(value.raw_size_text) &&
    (typeof value.in_stock === "boolean" || value.in_stock === null) &&
    isNullableString(value.sku_code) &&
    isNullableString(value.category_code) &&
    (value.notes === undefined || isNullableString(value.notes))
  );
}

export function parseCargillsImportedSnapshot(value: unknown): CargillsImportedSnapshot | null {
  if (
    !isRecord(value) ||
    value.provider !== "cargills" ||
    value.category !== "meat" ||
    typeof value.extraction_mode !== "string" ||
    typeof value.captured_at !== "string" ||
    !["ok", "partial", "blocked_or_unstable", "not_found"].includes(String(value.source_status)) ||
    !Array.isArray(value.items) ||
    !value.items.every(isSnapshotItem)
  ) {
    return null;
  }

  return value as CargillsImportedSnapshot;
}

export function normalizeCargillsImportedSnapshot(snapshot: CargillsImportedSnapshot): NormalizedProduct[] {
  return snapshot.items.map((item) =>
    normalizeCargillsProduct({
      id: item.id,
      source_url: item.source_url,
      source_product_id: item.source_product_id,
      captured_at: snapshot.captured_at,
      source_status: snapshot.source_status,
      name: item.name,
      displayed_price_lkr: item.displayed_price_lkr,
      in_stock: item.in_stock,
      raw_size_text: item.raw_size_text,
      notes: item.notes ?? "Imported from Cargills worker fetch snapshot.",
    })
  );
}

export function getImportedCargillsMeatProducts(): NormalizedProduct[] | null {
  const snapshot = parseCargillsImportedSnapshot(importedSnapshot);

  if (!snapshot || snapshot.items.length === 0) {
    return null;
  }

  return normalizeCargillsImportedSnapshot(snapshot);
}

export function getImportedCargillsSnapshotMeta():
  | Pick<CargillsImportedSnapshot, "captured_at" | "extraction_mode" | "source_status">
  | null {
  const snapshot = parseCargillsImportedSnapshot(importedSnapshot);
  if (!snapshot || snapshot.items.length === 0) {
    return null;
  }

  return {
    captured_at: snapshot.captured_at,
    extraction_mode: snapshot.extraction_mode,
    source_status: snapshot.source_status,
  };
}
