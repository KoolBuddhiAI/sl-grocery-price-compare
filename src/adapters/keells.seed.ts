import { normalizeKeellsProduct } from "../normalize.ts";
import type { NormalizedProduct } from "../schema.ts";

type SeedRecord = {
  id: string;
  source_product_id: string;
  name: string;
  source_url: string;
  displayed_price_lkr: number;
  raw_size_text: string;
  in_stock: boolean;
};

const CAPTURED_AT = "2026-04-12T00:00:00.000Z";

// Static sample data only.
// Live Keells fetch/scrape is intentionally out of scope here because this environment
// is region blocked for Keells access. This seed adapter exists to prove the shared
// schema, normalization, and API contract before any real extraction work.
const SEEDED_KEELLS_MEAT_RECORDS: SeedRecord[] = [
  {
    id: "keells-chicken-breast-500g",
    source_product_id: "seed-keells-001",
    name: "Keells Chicken Breast",
    source_url: "https://keellssuper.com/seed/chicken-breast-500g",
    displayed_price_lkr: 980,
    raw_size_text: "500 g",
    in_stock: true
  },
  {
    id: "keells-chicken-sausages-300g",
    source_product_id: "seed-keells-002",
    name: "Keells Chicken Sausages",
    source_url: "https://keellssuper.com/seed/chicken-sausages-300g",
    displayed_price_lkr: 720,
    raw_size_text: "Per 300g(s)",
    in_stock: true
  },
  {
    id: "keells-beef-cubes-1kg",
    source_product_id: "seed-keells-003",
    name: "Keells Beef Cubes",
    source_url: "https://keellssuper.com/seed/beef-cubes-1kg",
    displayed_price_lkr: 3200,
    raw_size_text: "1kg",
    in_stock: false
  },
  {
    id: "keells-whole-chicken-1-3kg",
    source_product_id: "seed-keells-004",
    name: "Keells Whole Chicken",
    source_url: "https://keellssuper.com/seed/whole-chicken-1-3kg",
    displayed_price_lkr: 2145,
    raw_size_text: "1.3kg",
    in_stock: true
  }
];

export function getSeededKeellsMeatProducts(): NormalizedProduct[] {
  return SEEDED_KEELLS_MEAT_RECORDS.map((record) =>
    normalizeKeellsProduct({
      id: record.id,
      source_url: record.source_url,
      source_product_id: record.source_product_id,
      captured_at: CAPTURED_AT,
      source_status: "partial",
      name: record.name,
      displayed_price_lkr: record.displayed_price_lkr,
      in_stock: record.in_stock,
      raw_size_text: record.raw_size_text,
      notes: "Seeded Keells sample record. No live fetch attempted from this environment."
    })
  );
}
