# Implementation Brief: Sri Lankan Grocery Price Comparison (Vertical Iteration 1)

## Scope

Iteration 1 only: `meat` category across:

- Cargills Online
- Keells Online
- Glomark

Goal: ship a small, reliable comparison slice on Cloudflare in under a few days, not a generalized crawler platform.

## Product Outcome for Iteration 1

Deliver a single read-only app/API that:

- fetches a small curated set of meat SKUs or meat listing pages from the three stores
- normalizes product data
- computes `price_per_kg_lkr`
- exposes a simple comparison view or JSON response
- records freshness of each source snapshot

Do not solve all categories, auth flows, checkout, or deep historical analytics yet.

## Safe Extraction Strategy by Site

Principle: use only public, unauthenticated pages or APIs reachable by a normal browser session. No CAPTCHA solving, no anti-bot evasion, no proxy rotation, no headless browser farm.

### 1. Cargills Online

Observed shape: public storefront pages appear heavily client-rendered, with product/listing data likely hydrated from frontend APIs.

Safe approach:

- First inspect browser network calls manually in DevTools from a normal session.
- Prefer a stable public JSON/XHR endpoint if product name, unit size, and price are already exposed there.
- If no usable endpoint exists, fetch public HTML and extract embedded JSON/state blobs before attempting brittle DOM parsing.
- Start with a curated allowlist of meat URLs or item identifiers instead of full-site discovery.

Operational guidance:

- Cache upstream fetches aggressively.
- Refresh at low frequency, for example every 6-12 hours at first.
- Abort source refresh on repeated 403/429/5xx responses.

### 2. Keells Online

Observed risk: public product pages exist, but the site also appears to sit behind Cloudflare-style protections and some surfaces are JS-only. This is the highest-risk source for anti-bot or region/access variance.

Safe approach:

- Test from a normal browser in the target operating region first.
- Check whether meat product/listing pages are reachable without login and without challenge pages.
- Inspect browser network traffic for public listing/product endpoints called by the frontend.
- If direct Worker fetches return challenge pages, 403s, or inconsistent region-blocked responses, do not attempt bypasses.
- In that case, downgrade Keells iteration 1 to one of these allowed patterns:
  - manual seed list refreshed by operator review
  - optional semi-manual import of a few public product URLs
  - temporary exclusion from automatic refresh, while keeping the schema/store slot ready

Decision rule:

- If Keells cannot be fetched cleanly by ordinary HTTP from Cloudflare Workers without bypass tactics, mark it `source_status = blocked_or_unstable` and ship with partial coverage rather than overbuilding around it.

### 3. Glomark

Observed shape: public product pages are indexable and include visible pack-size text such as `Per 300g(s)` and related-product pricing. This looks like the easiest initial source.

Safe approach:

- Start from public meat product pages or category pages.
- Extract product name, visible price, stock flag if present, pack size text, and canonical URL.
- Normalize pack sizes like `300g`, `1300g`, or `1kg`.
- Treat related-product blocks as non-authoritative unless the main product price is also present on-page.

Operational guidance:

- Make Glomark the first fully automated source.
- Use it to validate the normalization pipeline before expanding Keells/Cargills handling.

## Respectful Rate Limits and Legal/Operational Cautions

- Review each site’s Terms, robots behavior, and publicly visible access controls before automating.
- Use only publicly available data needed for comparison; do not touch login-only or customer-specific endpoints.
- Identify the app clearly in a `User-Agent` if possible.
- Keep requests sparse: start at roughly 1 request every 5-10 seconds per source during refresh, with jitter.
- Run a small number of requests per refresh job; prefer curated URLs over broad crawling.
- Honor `403`, `429`, challenge pages, and explicit blocking as stop signals.
- Log source errors and disable a source automatically after repeated failures.
- Expect location-based assortment and pricing differences in Sri Lanka; store the observed fetch region/assumptions in metadata.
- Treat prices as informational and time-stamped, not guaranteed current checkout prices.

## Normalized Product Schema

Use one normalized record per observed product snapshot.

```ts
type ProductSnapshot = {
  id: string; // internal stable id
  store: "cargills" | "keells" | "glomark";
  source_url: string;
  source_product_id?: string | null;
  source_category: "meat";
  captured_at: string; // ISO timestamp
  source_status: "ok" | "partial" | "blocked_or_unstable" | "not_found";

  name: string;
  brand?: string | null;
  meat_type?: "chicken" | "beef" | "pork" | "mutton" | "sausage" | "mixed" | "unknown";
  cut?: string | null; // breast, whole chicken, minced beef, etc.

  displayed_price_lkr: number | null;
  displayed_currency: "LKR";
  discount_text?: string | null;
  in_stock?: boolean | null;

  pack_qty: number | null;
  pack_unit: "g" | "kg" | "unit" | "unknown";
  net_weight_g: number | null;

  price_per_kg_lkr: number | null;

  image_url?: string | null;
  notes?: string | null;
  raw_size_text?: string | null;
};
```

Computation rules:

- `net_weight_g = pack_qty * 1000` when `pack_unit = "kg"`
- `net_weight_g = pack_qty` when `pack_unit = "g"`
- `price_per_kg_lkr = displayed_price_lkr / (net_weight_g / 1000)` when both values are present and `net_weight_g > 0`
- Otherwise `price_per_kg_lkr = null`

Normalization rules:

- Convert `Per 300g(s)` to `pack_qty=300`, `pack_unit="g"`, `net_weight_g=300`
- Convert `1.3kg`, `1300g`, `Per 1kg` consistently
- For products sold per piece without usable weight, keep them visible but leave `price_per_kg_lkr = null`

## Shortest-Path Cloudflare Architecture

Default architecture for iteration 1:

- `Cloudflare Worker`
  - serves `/api/products`
  - optionally serves a tiny HTML comparison page
  - contains source adapters and normalization logic
- `Cron Trigger` on the same Worker
  - refreshes upstream data on a schedule
- `KV`
  - stores the latest normalized snapshot JSON per source and a merged view

Why this is enough:

- Worker-only keeps deployment simple.
- Cron avoids scraping on every user request.
- KV is sufficient for latest-snapshot reads and cheap caching.

Do not add initially:

- `D1`: not needed until you want historical price tracking, diff queries, or audit history.
- `R2`: not needed unless storing large raw HTML/JSON archives or images.

Fallback if automation is not ready:

- Seed KV manually with a small JSON snapshot and still ship the comparison API/UI. That keeps the product vertical moving while source extraction stabilizes.

## Suggested Data Flow

1. Scheduled Worker fetches a short source-specific allowlist.
2. Each adapter parses raw source data into `ProductSnapshot`.
3. Worker computes `price_per_kg_lkr`.
4. Worker writes:
   - `snapshots/{store}`
   - `snapshots/latest-merged`
5. App/API reads only from KV for normal traffic.

## Four Shippable Iterations

### Iteration 1: Single-source vertical

Target: Glomark only, meat only, 5-15 products.

- implement schema and normalization
- compute `price_per_kg_lkr`
- expose JSON endpoint and minimal comparison page
- store latest snapshot in KV

Ship if one source works end to end.

### Iteration 2: Add Cargills

Target: Cargills + Glomark.

- add second adapter
- add merged sorting/filtering by meat type and `price_per_kg_lkr`
- add source freshness and source health status

Ship even if Cargills coverage is curated rather than discovered.

### Iteration 3: Keells decision slice

Target: safe Keells support or explicit fallback.

- test public fetch viability from Worker environment
- if viable, add a curated Keells adapter
- if not viable, expose Keells as `blocked_or_unstable` and document manual/semi-manual fallback

Ship either automated Keells coverage or explicit partial-coverage status.

### Iteration 4: Hardening

Target: operationally safe first release.

- add retry/backoff/jitter
- add parser failure alerts/logging
- add snapshot versioning or minimal change diff in KV metadata
- clean up product matching and naming consistency across stores

Ship when refresh jobs are predictable and failure modes are visible.

Each iteration should fit in 1-2 days if scope stays narrow and URLs are curated.

## How to Use Codex CLI Without Overbuilding

- Start by asking Codex to implement only iteration 1 with one source and one endpoint.
- Keep prompts concrete: source, target fields, exact output shape, and stop conditions.
- Ask Codex to inspect one source at a time; do not ask for a generalized scraping framework up front.
- Prefer files like:
  - `worker/src/adapters/glomark.ts`
  - `worker/src/schema.ts`
  - `worker/src/normalize.ts`
  - `worker/src/index.ts`
- Delay abstractions until the second source proves the common shape.
- Use Codex for vertical slices:
  - adapter for one store
  - normalization tests for size parsing
  - KV read/write wiring
  - small HTML/JSON output

Recommended first Codex task:

> Build iteration 1 only: a Cloudflare Worker that loads a curated list of 5-10 Glomark meat product URLs, normalizes them into the provided schema, computes `price_per_kg_lkr`, stores the latest merged snapshot in KV on a cron schedule, and serves `/api/products`.

## Practical Recommendation

The fastest credible path is:

1. ship Glomark first
2. add Cargills second
3. treat Keells as conditional on clean public access from Workers

That keeps the app useful without crossing into brittle or questionable scraping tactics.
