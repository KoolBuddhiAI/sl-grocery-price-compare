# Sri Lankan Grocery Price Compare

Price comparison across Keells, Glomark, and Cargills with normalized unit pricing so shoppers can find the most cost-effective option.

## The Problem

Same product, three stores, three different names, three different package sizes. Without unit pricing, it's impossible to compare at a glance.

| Store | Product | Package Price | Package Size | Price per KG |
|-------|---------|--------------|--------------|--------------|
| Keells | Bairaha Half Chicken | Rs 1,250 | per kg | **Rs 1,250/kg** |
| Glomark | Chicken Breast | Rs 564 | 300g | **Rs 1,880/kg** |
| Cargills | Bairaha Marinated Chicken Thigh | Rs 790 | 300g | **Rs 2,633/kg** |

This app normalizes everything into a common schema with unit prices, grouped by product type so you can compare "Whole Chicken" across all stores and brands.

## Architecture

Hybrid ingestion — each store uses the method that works for it:

| Store | Method | Bot Protection | Products | Status |
|-------|--------|----------------|----------|--------|
| **Keells** | Local Puppeteer + stealth → push to KV | Cloudflare | 80 | Done |
| **Glomark** | Worker cron → HTML fetch → KV | None | 38 | Done |
| **Cargills** | Worker cron → session + POST API → KV | None | 82 | Done |

See [docs/architecture-big-picture.md](docs/architecture-big-picture.md) for the full system diagram.

## Docs

| Document | Description |
|----------|-------------|
| [Product Brief](docs/product-brief.md) | Vision, problem, users, scope |
| [PRD](docs/prd.md) | Detailed requirements, API spec, milestones |
| [Architecture](docs/architecture-big-picture.md) | System design, KV storage, cron, push |
| [Provider Rollout](docs/provider-rollout-plan.md) | Per-store implementation plan and phases |
| [Keells Provider](docs/keells-provider.md) | Keells API docs and capture automation |
| [Glomark Provider](docs/glomark-provider.md) | Glomark HTML extraction docs |
| [Cargills Provider](docs/cargills-provider.md) | Cargills session + POST API docs |

## Quick Start

### Prerequisites

```bash
npm install
cd web && npm install && cd ..
```

### Run locally (API + Frontend)

```bash
# Terminal 1: Worker API
npm run dev                                 # starts on http://localhost:8787

# Terminal 2: Astro frontend
cd web && npm run dev                       # starts on http://localhost:4321
```

Open http://localhost:4321/meat to see the price comparison.

### Run tests

```bash
npm test                                    # 28 tests across all providers
```

## Updating Prices

### Keells (local capture required — Cloudflare-protected)

Keells is behind Cloudflare bot detection, so capture must run locally using Puppeteer with stealth mode. The script launches a headless browser, bypasses Cloudflare, establishes a guest session, and calls the Keells product API directly.

```bash
# Capture fresh Keells prices (saves to data/keells.meat.import.json)
npm run keells:capture -- --headless

# Preview without writing
npm run keells:capture -- --headless --dry-run

# Capture and push to deployed Worker in one step
npm run keells:capture -- --headless --push

# Or push an existing snapshot separately
npm run keells:push
```

**Environment variables for push:**

```bash
export WORKER_URL="https://price-compare-cloudflare.your-subdomain.workers.dev"
export SNAPSHOT_API_KEY="your-secret-key"
```

Or pass inline:

```bash
WORKER_URL=https://... SNAPSHOT_API_KEY=secret npm run keells:capture -- --headless --push
```

**Automated local cron (macOS):**

```bash
# Run every 12 hours
crontab -e
0 */12 * * * cd /path/to/sl-grocery-price-compare && npm run keells:capture -- --headless --push >> /tmp/keells-capture.log 2>&1
```

See [docs/keells-provider.md](docs/keells-provider.md) for full API documentation.

### Glomark & Cargills (automatic — Worker cron)

These stores have no bot protection. The Cloudflare Worker fetches them automatically via cron trigger (every 6 hours). No manual action needed once deployed.

To trigger manually during development:

```bash
# Trigger cron locally
curl http://localhost:8787/cdn-cgi/handler/scheduled

# Or fetch directly
curl http://localhost:8787/api/glomark/fetch
curl http://localhost:8787/api/cargills/fetch
```

### Regenerate product type mapping

When product data changes (new products added), regenerate the auto-categorization:

```bash
npm run generate:product-types              # fresh generation
npm run generate:product-types -- --update  # preserve manual corrections
```

Edit `data/product-type-mapping.json` to fix mismatches — set `confidence: "manual"` on corrected entries.

## API

| Endpoint | Description |
|----------|-------------|
| `GET /api/products` | All 200 products across all stores |
| `GET /api/products?store=keells` | Filter by store |
| `GET /api/health` | Per-store freshness, status, product counts |
| `POST /api/snapshots` | Push snapshot to KV (requires Bearer auth) |
| `GET /api/glomark/fetch` | Live fetch from Glomark (debug) |
| `GET /api/cargills/fetch` | Live fetch from Cargills (debug) |

## Deployment

```bash
# Deploy Worker
npm run deploy

# Set the snapshot push API key
npx wrangler secret put SNAPSHOT_API_KEY

# Create KV namespace (first time only)
npx wrangler kv namespace create SNAPSHOTS
# Then update the id in wrangler.jsonc

# Deploy Astro frontend (connect web/ to Cloudflare Pages via GitHub)
cd web && npm run build
```

## Project Structure

```
src/
  index.ts                     # Worker: API + cron + snapshot push
  kv-helpers.ts                # KV read/write with fallback
  schema.ts                    # TypeScript types (3 stores)
  normalize.ts                 # Pack size parsing, unit price computation
  adapters/
    keells.seed.ts             # Keells fallback seeded data
    glomark.fetch.ts           # Glomark HTML fetch + JSON extraction
    cargills.fetch.ts          # Cargills session bootstrap + POST API
  providers/
    keells.import.ts           # Keells snapshot parser + normalizer
    glomark.import.ts          # Glomark snapshot parser + normalizer
    cargills.import.ts         # Cargills snapshot parser + normalizer
scripts/
  keells-capture.mjs           # Puppeteer capture (local, --push flag)
  keells-push.mjs              # Push existing snapshot to Worker
  keells-refresh.mjs           # Clipboard/file-based refresh
  keells-browser-export.mjs    # Raw-to-import transform
  generate-product-types.mjs   # Auto-categorize products into types
data/
  keells.meat.import.json      # Keells snapshot (80 products)
  glomark.meat.import.json     # Glomark snapshot (38 products)
  cargills.meat.import.json    # Cargills snapshot (82 products)
  product-type-mapping.json    # Product type categorization (200 products)
web/
  src/pages/                   # Astro pages (homepage, meat comparison)
  src/components/              # React islands (filters, product groups)
  src/lib/                     # API client, product type helpers
test/
  normalize.test.ts            # Normalization tests
  glomark.test.ts              # Glomark adapter tests (11)
  cargills.test.ts             # Cargills adapter tests (11)
  keells-browser-export.test.ts # Keells transform tests
docs/
  product-brief.md             # Product vision
  prd.md                       # Detailed requirements
  architecture-big-picture.md  # System architecture
  provider-rollout-plan.md     # Implementation phases
  keells-provider.md           # Keells API docs
  glomark-provider.md          # Glomark extraction docs
  cargills-provider.md         # Cargills API docs
```
