import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const VALID_SOURCE_STATUSES = new Set(["ok", "partial", "blocked_or_unstable", "not_found"]);

function parseArgs(argv) {
  const positionals = [];
  const options = {
    capturedAt: new Date().toISOString(),
    sourceStatus: "ok"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--captured-at") {
      options.capturedAt = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--source-status") {
      options.sourceStatus = argv[index + 1];
      index += 1;
      continue;
    }

    positionals.push(arg);
  }

  return {
    inputPath: positionals[0],
    outputPath: positionals[1],
    ...options
  };
}

function coerceObject(value) {
  return typeof value === "object" && value !== null ? value : null;
}

function readString(record, keys, fallback = null) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return fallback;
}

function readNullableString(record, keys) {
  for (const key of keys) {
    const value = record[key];
    if (value === null) {
      return null;
    }
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function parsePrice(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value
      .replace(/rs\.?/gi, "")
      .replace(/,/g, "")
      .replace(/[^0-9.]/g, "");
    if (!normalized) {
      return null;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function parseStock(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value > 0;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (["true", "yes", "in stock", "available", "available now"].includes(normalized)) {
      return true;
    }

    if (["false", "no", "out of stock", "unavailable", "sold out"].includes(normalized)) {
      return false;
    }
  }

  return null;
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function toImportId(record, index) {
  const explicitId = readString(record, ["id"]);
  if (explicitId) {
    return explicitId;
  }

  const sourceProductId = readString(record, ["source_product_id", "productId", "product_id", "sku"]);
  if (sourceProductId) {
    return `${slugify(sourceProductId)}-import`;
  }

  const name = readString(record, ["name", "title"]);
  if (name) {
    return `${slugify(name)}-import`;
  }

  return `keells-item-${index + 1}-import`;
}

export function transformRawKeellsRecords(rawInput, options = {}) {
  const capturedAt = options.capturedAt ?? new Date().toISOString();
  const sourceStatus = options.sourceStatus ?? "ok";

  if (!VALID_SOURCE_STATUSES.has(sourceStatus)) {
    throw new Error(`Invalid source status: ${sourceStatus}`);
  }

  const rawItems = Array.isArray(rawInput)
    ? rawInput
    : Array.isArray(coerceObject(rawInput)?.items)
      ? coerceObject(rawInput).items
      : null;

  if (!rawItems) {
    throw new Error("Raw input must be a JSON array or an object with an items array.");
  }

  const items = rawItems.map((value, index) => {
    const record = coerceObject(value);
    if (!record) {
      throw new Error(`Raw item at index ${index} is not an object.`);
    }

    const name = readString(record, ["name", "title"]);
    const sourceUrl = readString(record, ["source_url", "url", "link"]);

    if (!name) {
      throw new Error(`Raw item at index ${index} is missing a name/title field.`);
    }

    if (!sourceUrl) {
      throw new Error(`Raw item at index ${index} is missing a source_url/url/link field.`);
    }

    return {
      id: toImportId(record, index),
      source_product_id: readNullableString(record, ["source_product_id", "productId", "product_id", "sku"]),
      name,
      source_url: sourceUrl,
      displayed_price_lkr: parsePrice(record.displayed_price_lkr ?? record.price ?? record.price_lkr),
      raw_size_text: readNullableString(record, ["raw_size_text", "size", "weight", "pack"]),
      in_stock: parseStock(record.in_stock ?? record.inStock ?? record.available ?? record.availability),
      notes: readNullableString(record, ["notes"])
    };
  });

  return {
    provider: "keells",
    category: "meat",
    extraction_mode: "browser_assisted",
    captured_at: capturedAt,
    source_status: sourceStatus,
    items
  };
}

async function main() {
  const { inputPath, outputPath, capturedAt, sourceStatus } = parseArgs(process.argv.slice(2));

  if (!inputPath || !outputPath) {
    console.error(
      "Usage: node scripts/keells-browser-export.mjs <input.json> <output.json> [--captured-at <iso>] [--source-status <ok|partial|blocked_or_unstable|not_found>]"
    );
    process.exitCode = 1;
    return;
  }

  const rawText = await fs.readFile(inputPath, "utf8");
  const rawInput = JSON.parse(rawText);
  const snapshot = transformRawKeellsRecords(rawInput, { capturedAt, sourceStatus });

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
