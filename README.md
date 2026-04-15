# Sri Lankan Grocery Price Compare Worker

Minimal Cloudflare Worker slice for a Sri Lankan grocery price comparison app, now positioned as the read/API layer inside a hybrid ingestion architecture.

This repo intentionally proves only a narrow vertical today:

- one Worker
- one `GET /api/products` endpoint
- one normalized product schema
- one seeded Keells meat adapter using static sample records only
- one browser-assisted Keells snapshot import path using a checked-in sample JSON export

There is no scraping, frontend, database, KV, D1, or R2 in this iteration.

## Docs

The docs set under [`docs/`](/root/.openclaw/workspace/WIP/price-compare-cloudflare/docs) describes the broader product and architecture direction:

- [Product brief](/root/.openclaw/workspace/WIP/price-compare-cloudflare/docs/product-brief.md)
- [Architecture big picture](/root/.openclaw/workspace/WIP/price-compare-cloudflare/docs/architecture-big-picture.md)
- [Provider rollout plan](/root/.openclaw/workspace/WIP/price-compare-cloudflare/docs/provider-rollout-plan.md)

The high-level direction is hybrid:

- Cloudflare Worker remains the public API and normalized read layer
- providers that can be fetched safely from Workers can use Cloudflare-native ingestion
- hard providers such as Keells can use external ingestion and push normalized snapshots into the read layer

Current practical status: a working Keells provider exists outside this repo via Puppeteer, while this repo currently consumes a checked-in Keells snapshot sample plus a seeded fallback.

## Current Keells Data Modes

Keells live access is intentionally **not** implemented here. In this environment, Keells fetches are region blocked, so the Worker supports two minimal modes only:

- imported snapshot mode: preferred when a valid browser-assisted export exists
- seeded fallback mode: used when no valid imported snapshot is present

See [src/adapters/keells.seed.ts](/root/.openclaw/workspace/WIP/price-compare-cloudflare/src/adapters/keells.seed.ts:1), [src/providers/keells.import.ts](/root/.openclaw/workspace/WIP/price-compare-cloudflare/src/providers/keells.import.ts:1), and [src/index.ts](/root/.openclaw/workspace/WIP/price-compare-cloudflare/src/index.ts:1).

## Browser-Assisted Import Flow

Keells live access is still intentionally disabled from this server. The supported workflow is a small manual export flow run from a separate, browser-capable environment. This repo's import contract is also the intended bridge point for the external Puppeteer-based Keells provider.

1. In an allowed browser session, open a Keells meat listing page and wait for the visible product cards to load.
2. Open DevTools and paste the full snippet from [scripts/keells-browser-console-snippet.js](/root/.openclaw/workspace/WIP/price-compare-cloudflare/scripts/keells-browser-console-snippet.js:1) into the Console.
3. The snippet returns an array of raw product objects and tries to copy the JSON to your clipboard automatically. If DevTools did not copy it, run:

```js
copy(JSON.stringify(window.__keellsCapture, null, 2))
```

4. Save that JSON into a local file in this repo, for example `data/keells.browser-raw.capture.json`. The raw shape should look like [data/keells.browser-raw.sample.json](/root/.openclaw/workspace/WIP/price-compare-cloudflare/data/keells.browser-raw.sample.json:1).
5. Run the transformer in this repo:

```bash
npm run keells:transform -- data/keells.browser-raw.capture.json data/keells.meat.import.from-raw.sample.json --captured-at 2026-04-12T09:00:00.000Z --source-status ok
```

6. Replace `data/keells.meat.import.json` with the generated output when you want the Worker to consume that snapshot.
7. Run `npm test` to verify the snapshot still matches the import contract used by [src/providers/keells.import.ts](/root/.openclaw/workspace/WIP/price-compare-cloudflare/src/providers/keells.import.ts:1).

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

The browser snippet is intentionally defensive, not tightly coupled to one exact DOM shape. The selectors most likely to need updates over time are the product-card, title, price, size, and availability selectors in [scripts/keells-browser-console-snippet.js](/root/.openclaw/workspace/WIP/price-compare-cloudflare/scripts/keells-browser-console-snippet.js:1).

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

## Direction

This repo does not yet implement the full multi-provider system described in the docs. The intended next shape is:

- stored latest snapshot per provider
- merged read path in the Worker
- provider-specific ingestion chosen per source reality rather than one enforced scraping pattern

## Vertical Iteration Approach

Iteration 1 uses seeded Keells data and proves the schema/API.

Iteration 2 adds browser-assisted snapshot import for Keells without live scraping from this server.

Iteration 3 revisits browser extraction/export tooling in an allowed environment and generalizes the read layer for additional providers.
