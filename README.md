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

The intended future Keells flow is:

1. Run browser-assisted extraction in an allowed environment where Keells can be accessed legitimately.
2. Export raw product JSON in the snapshot shape shown in [data/keells.meat.import.json](/root/.openclaw/workspace/WIP/price-compare-cloudflare/data/keells.meat.import.json:1).
3. Commit or otherwise import that snapshot into the Worker codebase.
4. Let the Worker validate and normalize the snapshot into the shared product schema.

This repo deliberately does **not** implement the extraction/browser automation itself. It only defines the import contract and consumes a sample snapshot.

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
