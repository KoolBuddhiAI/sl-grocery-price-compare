# Provider Rollout Plan

## Rollout Principle

Choose the lowest-risk ingestion path per provider. Do not force Worker-native fetching when the provider is better handled by external ingestion.

## Provider Summary

| Store | Rendering | Bot Protection | Ingestion | Status |
|-------|-----------|----------------|-----------|--------|
| **Keells** | React SPA | Cloudflare (cf_clearance) | Local Puppeteer + stealth | Done -- 80 meat products |
| **Glomark** | Server-rendered HTML + jQuery | None | Worker-native HTML fetch | Ready to build |
| **Cargills** | AngularJS SPA + ASP.NET | None | Worker-native POST API (needs validation) | Needs investigation |

## Phase 1: Glomark (Worker-Native)

**Priority: first Worker-native provider. Validates the cloud-side ingestion pattern.**

Classification: `worker-native`

Evidence:
- Server-rendered HTML with product data in the initial response
- No Cloudflare, no bot protection, no JS rendering needed
- Product fields available: name, price, weight, brand, stock, image, product ID
- JSON-LD structured data on product pages

Site structure:
- Category URL: `https://glomark.lk/fresh/meat/c/144`
- Product URL: `https://glomark.lk/{slug}/p/{id}`
- Key categories: `/fresh/meat/c/144`, `/fresh/fish/c/146`, `/frozen/processed---preserved-meat/c/151`
- ~18 products per page, "Show More" AJAX for pagination

Implementation plan:
1. Build Glomark adapter that fetches category HTML from Worker
2. Parse product cards: name, price (LKR), weight text, stock, URL, image
3. Handle "Show More" pagination (investigate AJAX endpoint)
4. Normalize into shared snapshot contract
5. Write to KV on cron schedule
6. Add to merged `/api/products` response

Risks: HTML structure changes, "Show More" pagination endpoint discovery, weight text parsing variations

Cadence: every 6 hours

## Phase 2: Cargills (Worker-Native API, needs validation)

**Priority: second provider. Adds three-store comparison.**

Classification: `needs-investigation` -> likely `worker-native`

Evidence:
- No bot protection detected
- Product data loaded via AJAX POST to `/Web/*` endpoints
- AngularJS templates reveal field names: `ItemName`, `Price`, `UnitSize`, `UOM`, `Inventory`
- ASP.NET MVC backend with RESTish endpoints

Key unknowns to resolve:
1. **Does `/Web/GetSearchBarProductsV1` work from a Worker without session cookies?** Test with a simple POST from Worker. If yes, this is the easiest path.
2. **What is the category product listing endpoint?** The AngularJS controller that loads products for a category page is in an external JS file. Need to inspect browser network tab to find the actual AJAX call.
3. **Are the encoded IDs (`EnId`) session-dependent?** If stable, they can be hardcoded per category.

Investigation steps:
1. Open Cargills meat category in browser with DevTools Network tab
2. Identify the AJAX POST that loads the product grid
3. Capture the endpoint URL, request body, and response shape
4. Test the same call from a Worker (no cookies)
5. If it works: build Worker-native adapter
6. If session required: use Puppeteer (same pattern as Keells)

Fallback: If POST APIs require session cookies, use browser-assisted capture like Keells. No bot protection means regular Puppeteer (no stealth plugin needed).

Cadence: every 6 hours if Worker-native, every 12 hours if browser-assisted

## Phase 3: Multi-Store Comparison Features

After all three stores are ingesting:

1. **Merged snapshot**: pre-compute cross-store comparison view per category
2. **Category expansion**: add seafood, vegetables, fruits, beverages
3. **Product matching**: manual mapping of equivalent products across stores (e.g. "Chicken Breast" across all three)
4. **Frontend**: comparison UI with unit price sorting

## Phase 4: Hardening

1. Retry/backoff for failed fetches
2. Stale data alerts (>24h without refresh)
3. Parser failure detection (product count drops significantly)
4. Automated health checks on `GET /api/health`
5. Snapshot versioning in KV metadata

## Keells (already built)

Classification: `external-ingest`

Current state:
- Automated Puppeteer + stealth capture working
- 80 meat products captured
- `npm run keells:capture -- --headless` runs the full pipeline
- Data written to `data/keells.meat.import.json`

Next steps:
- Set up local cron (every 6-12 hours)
- Automate push to cloud (git push + GH Actions, or direct KV upload)
- Expand to seafood, vegetables categories (`--category seafood`)

See `docs/keells-provider.md` for full API documentation and architecture.

## New Provider Checklist

For each new store, validate before implementation:

- [ ] Can a Worker fetch the needed data without login or challenge pages?
- [ ] Is product data in the HTML, or does it need JS rendering / API calls?
- [ ] What fields are available? (name, price, weight, stock, image, ID)
- [ ] What is the weight/size format? (grams, kg, per piece, ml, litres)
- [ ] Is there pagination? How does it work?
- [ ] What is a safe refresh cadence?
- [ ] What are the stop conditions? (repeated 403s, empty responses, etc.)
