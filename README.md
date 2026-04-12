# Sri Lankan Grocery Price Compare Worker

Minimal Cloudflare Worker slice for a Sri Lankan grocery price comparison app.

This repo intentionally proves only a narrow vertical:

- one Worker
- one `GET /api/products` endpoint
- one normalized product schema
- one seeded Keells meat adapter using static sample records only
- one browser-assisted Keells snapshot import path using a checked-in sample JSON export

There is no scraping, frontend, database, KV, D1, or R2 in this iteration.

## Keells Data Modes

Keells live access is intentionally **not** implemented here. In this environment, Keells fetches are region blocked, so the Worker supports two minimal modes only:

- imported snapshot mode: preferred when a valid browser-assisted export exists
- seeded fallback mode: used when no valid imported snapshot is present

See [src/adapters/keells.seed.ts](/root/.openclaw/workspace/WIP/price-compare-cloudflare/src/adapters/keells.seed.ts:1), [src/providers/keells.import.ts](/root/.openclaw/workspace/WIP/price-compare-cloudflare/src/providers/keells.import.ts:1), and [src/index.ts](/root/.openclaw/workspace/WIP/price-compare-cloudflare/src/index.ts:1).

## Browser-Assisted Import Flow

Keells live access is still intentionally disabled from this server. The supported workflow is a small manual export flow run from a separate, browser-capable environment.

1. In an allowed browser environment, open the relevant Keells meat page or product pages.
2. Copy visible product fields or a browser-captured API payload into a local JSON file using the simple raw array shape shown in [data/keells.browser-raw.sample.json](/root/.openclaw/workspace/WIP/price-compare-cloudflare/data/keells.browser-raw.sample.json:1).
3. Run the transformer in this repo:

```bash
npm run keells:transform -- data/keells.browser-raw.sample.json data/keells.meat.import.from-raw.sample.json --captured-at 2026-04-12T09:00:00.000Z --source-status ok
```

4. Replace `data/keells.meat.import.json` with the generated output when you want the Worker to consume that snapshot.
5. Run `npm test` to verify the snapshot still matches the import contract used by [src/providers/keells.import.ts](/root/.openclaw/workspace/WIP/price-compare-cloudflare/src/providers/keells.import.ts:1).

Accepted raw record fields are intentionally small:

- `name` or `title`
- `url`, `link`, or `source_url`
- `price`, `price_lkr`, or `displayed_price_lkr`
- `size`, `weight`, `pack`, or `raw_size_text`
- `inStock`, `in_stock`, `available`, or `availability`
- optional `productId`, `product_id`, `source_product_id`, or `sku`
- optional `notes`

The transformer always emits the checked import contract:

- `provider: "keells"`
- `category: "meat"`
- `extraction_mode: "browser_assisted"`
- `captured_at`
- `source_status`
- `items[]` matching the item contract consumed by the provider

See the raw sample fixture at [data/keells.browser-raw.sample.json](/root/.openclaw/workspace/WIP/price-compare-cloudflare/data/keells.browser-raw.sample.json:1) and the corresponding transformed output at [data/keells.meat.import.from-raw.sample.json](/root/.openclaw/workspace/WIP/price-compare-cloudflare/data/keells.meat.import.from-raw.sample.json:1).

## API

`GET /api/products`

Returns imported Keells meat products when a valid snapshot is present, otherwise falls back to seeded Keells meat products. Both paths normalize into the same schema and compute `price_per_kg_lkr`.

Example fields:

- `id`
- `store`
- `source_url`
- `source_category`
- `displayed_price_lkr`
- `pack_qty`
- `pack_unit`
- `net_weight_g`
- `price_per_kg_lkr`
- `raw_size_text`

## Normalization

The pure normalization module handles pack-size strings such as:

- `300g`
- `500 g`
- `1kg`
- `1.3kg`
- `Per 300g(s)`

See [src/normalize.ts](/root/.openclaw/workspace/WIP/price-compare-cloudflare/src/normalize.ts:1).

The import validator/normalizer lives in [src/providers/keells.import.ts](/root/.openclaw/workspace/WIP/price-compare-cloudflare/src/providers/keells.import.ts:1). The checked-in sample browser export lives in [data/keells.meat.import.json](/root/.openclaw/workspace/WIP/price-compare-cloudflare/data/keells.meat.import.json:1).

## Run

```bash
npm test
npm run dev
```

Wrangler writes logs under `$HOME`, so the provided scripts set `HOME=/tmp` for local runs in restricted environments like this one.

## Vertical Iteration Approach

Iteration 1 uses seeded Keells data and proves the schema/API.

Iteration 2 adds browser-assisted snapshot import for Keells without live scraping from this server.

Iteration 3 revisits browser extraction/export tooling in an allowed environment.
