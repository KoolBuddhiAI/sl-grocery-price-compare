# Sri Lankan Grocery Price Compare Worker

Minimal Cloudflare Worker slice for a Sri Lankan grocery price comparison app.

This repo intentionally proves only a narrow vertical:

- one Worker
- one `GET /api/products` endpoint
- one normalized product schema
- one seeded Keells meat adapter using static sample records only

There is no scraping, frontend, database, KV, D1, or R2 in this iteration.

## Why Keells is Seeded

Keells live access is intentionally **not** implemented here. In this environment, Keells fetches are region blocked, so the adapter uses static sample records only. That limitation is explicit in the code and the API response metadata.

See [src/adapters/keells.seed.ts](/root/.openclaw/workspace/WIP/price-compare-cloudflare/src/adapters/keells.seed.ts:1) for the seed-only adapter and [src/index.ts](/root/.openclaw/workspace/WIP/price-compare-cloudflare/src/index.ts:1) for the API route.

## API

`GET /api/products`

Returns seeded Keells meat products normalized into a shared schema, including computed `price_per_kg_lkr`.

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

## Run

```bash
npm test
npm run dev
```

Wrangler writes logs under `$HOME`, so the provided scripts set `HOME=/tmp` for local runs in restricted environments like this one.

## Vertical Iteration Approach

Iteration 1 uses seeded Keells data and proves the schema/API.

Iteration 2 adds real fetchable sources.

Iteration 3 revisits live Keells extraction from an allowed environment.
