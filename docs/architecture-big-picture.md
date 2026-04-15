# Architecture Big Picture

## Intent

Use a hybrid architecture:

- Cloudflare Worker as the public API and normalized read layer
- Cloudflare-native fetch/automation only for providers that can be reached safely and consistently from Workers
- external or home cron ingestion for hard providers such as Keells when Worker access is blocked, inconsistent, or too brittle

This matches the repo's current state better than pretending all providers should be fetched live from the Worker.

## Current Repo Baseline

Today this repo already has the core read-side shape:

- normalized product schema in [src/schema.ts](/root/.openclaw/workspace/WIP/price-compare-cloudflare/src/schema.ts:1)
- normalization logic in [src/normalize.ts](/root/.openclaw/workspace/WIP/price-compare-cloudflare/src/normalize.ts:1)
- a checked import contract plus validation in [src/providers/keells.import.ts](/root/.openclaw/workspace/WIP/price-compare-cloudflare/src/providers/keells.import.ts:1)
- a public Worker endpoint in [src/index.ts](/root/.openclaw/workspace/WIP/price-compare-cloudflare/src/index.ts:1)

The current Worker serves Keells meat products from:

- imported snapshot mode when `data/keells.meat.import.json` is valid
- seeded fallback mode when no valid imported snapshot is available

## Recommended System Shape

### 1. Cloudflare Worker: public API and read layer

Responsibilities:

- serve normalized product data to clients
- expose freshness and provider health metadata
- merge provider snapshots into one response shape
- avoid scraping on user requests

Near-term read contract:

- `GET /api/products`
- returns normalized items plus per-provider metadata such as `captured_at`, `source_status`, and ingestion mode

### 2. Worker-native provider ingestion

Use this only when a provider can be fetched safely from Workers using public pages or public JSON endpoints.

Good fit:

- stable public HTML or JSON
- no login requirement
- no recurring challenge pages or region blocking
- low enough request volume to keep refresh jobs small and respectful

Typical path:

1. Cron trigger runs on Cloudflare.
2. Provider adapter fetches a curated allowlist or stable listing/API endpoint.
3. Adapter normalizes raw records into the shared snapshot contract.
4. Worker writes the latest provider snapshot to storage.

### 3. External or home cron ingestion

Use this for providers that are blocked, challenge-protected, or operationally easier from a browser-capable machine.

Good fit:

- Puppeteer or browser automation already works outside this repo
- the site behaves differently by region or browser context
- Worker fetches return challenge pages, 403s, or incomplete data

Typical path:

1. External job captures provider data.
2. External job transforms it into the normalized snapshot contract used by this repo.
3. Snapshot is pushed into the system for Worker reads.
4. Worker serves only stored snapshots, not live provider fetches.

Keells currently belongs in this path based on the repo state and the separate working Puppeteer provider.

## Normalized Snapshot Contract

This repo already establishes the practical pattern:

- provider-specific raw extraction
- transform into a small snapshot document
- validate snapshot shape
- normalize each item into API records

Current checked contract fields for the Keells import snapshot:

- `provider`
- `category`
- `extraction_mode`
- `captured_at`
- `source_status`
- `items[]`

Each normalized item then carries fields such as:

- `id`
- `store`
- `source_url`
- `source_product_id`
- `displayed_price_lkr`
- `pack_qty`
- `pack_unit`
- `net_weight_g`
- `price_per_kg_lkr`
- `raw_size_text`

Recommendation:

- keep provider snapshot documents small and explicit
- validate them before serving
- treat the normalized item shape as the stable public contract

## Freshness and `source_status`

Every provider snapshot should include:

- `captured_at`: when the source data was observed
- `source_status`: current source health for that snapshot

Practical status meanings:

- `ok`: snapshot looks complete enough for normal use
- `partial`: usable, but known to have limited coverage or missing fields
- `blocked_or_unstable`: provider could not be fetched reliably by the intended path
- `not_found`: fetch completed but the expected product/listing data was absent

The API should surface these values directly so clients can explain coverage gaps instead of hiding them.

## Ingestion Flow

Recommended steady-state flow:

1. Each provider produces a latest snapshot through either Worker-native or external ingestion.
2. Snapshot is validated against the provider contract.
3. Items are normalized into the shared schema.
4. Latest normalized provider snapshot is stored.
5. Worker reads from stored snapshots and returns merged results.

That separation keeps ingestion failures away from end-user request latency.

## Storage Options

Current repo:

- checked-in JSON import file for Keells
- no remote persistence yet

Reasonable next options:

- `KV` for latest snapshot per provider and a merged latest view
- `D1` later if historical tracking, audit history, or diff queries become important

Practical recommendation:

- use KV first for latest reads
- add D1 only when history is a real product requirement

R2 is optional later for raw archives if external jobs start storing larger artifacts.
