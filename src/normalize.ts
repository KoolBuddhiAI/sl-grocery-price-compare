import type { NormalizedProduct, ParsedPackSize, Store } from "./schema.ts";

type NormalizeInput = {
  id: string;
  source_url: string;
  source_product_id?: string | null;
  captured_at: string;
  source_status: NormalizedProduct["source_status"];
  name: string;
  displayed_price_lkr: number | null;
  in_stock?: boolean | null;
  raw_size_text?: string | null;
  notes?: string | null;
};

const PACK_SIZE_PATTERN = /^(?:per\s+)?(\d+(?:\.\d+)?)\s*(kg|g)(?:\(s\))?$/i;

export function parsePackSize(rawSizeText: string | null | undefined): ParsedPackSize {
  if (!rawSizeText) {
    return { pack_qty: null, pack_unit: "unknown", net_weight_g: null, raw_size_text: null };
  }

  const normalized = rawSizeText.trim().toLowerCase().replace(/\s+/g, " ");
  const match = normalized.match(PACK_SIZE_PATTERN);

  if (!match) {
    return {
      pack_qty: null,
      pack_unit: "unknown",
      net_weight_g: null,
      raw_size_text: rawSizeText
    };
  }

  const qty = Number(match[1]);
  const unit = match[2] as "g" | "kg";
  const netWeightG = unit === "kg" ? qty * 1000 : qty;

  return {
    pack_qty: qty,
    pack_unit: unit,
    net_weight_g: netWeightG,
    raw_size_text: rawSizeText
  };
}

export function computePricePerKgLkr(
  displayedPriceLkr: number | null,
  netWeightG: number | null
): number | null {
  if (displayedPriceLkr === null || netWeightG === null || netWeightG <= 0) {
    return null;
  }

  return Number((displayedPriceLkr / (netWeightG / 1000)).toFixed(2));
}

function normalizeProduct(store: Store, input: NormalizeInput): NormalizedProduct {
  const pack = parsePackSize(input.raw_size_text);

  return {
    id: input.id,
    store,
    source_url: input.source_url,
    source_product_id: input.source_product_id ?? null,
    source_category: "meat",
    captured_at: input.captured_at,
    source_status: input.source_status,
    name: input.name,
    displayed_price_lkr: input.displayed_price_lkr,
    displayed_currency: "LKR",
    in_stock: input.in_stock ?? null,
    pack_qty: pack.pack_qty,
    pack_unit: pack.pack_unit,
    net_weight_g: pack.net_weight_g,
    price_per_kg_lkr: computePricePerKgLkr(input.displayed_price_lkr, pack.net_weight_g),
    raw_size_text: pack.raw_size_text,
    notes: input.notes ?? null
  };
}

export function normalizeKeellsProduct(input: NormalizeInput): NormalizedProduct {
  return normalizeProduct("keells", input);
}

export function normalizeGlomarkProduct(input: NormalizeInput): NormalizedProduct {
  return normalizeProduct("glomark", input);
}

export function normalizeCargillsProduct(input: NormalizeInput): NormalizedProduct {
  return normalizeProduct("cargills", input);
}
