# Sri Lankan Grocery Price Compare

Price comparison across Keells, Glomark, and Cargills with normalized unit pricing so shoppers can find the most cost-effective option.

## The Problem

Same product, three stores, three different names, three different package sizes. Without unit pricing, it's impossible to compare at a glance.

| Store | Product | Package Price | Package Size | Price per KG |
|-------|---------|--------------|--------------|--------------|
| Keells | Bairaha Half Chicken | Rs 1,250 | per kg | **Rs 1,250/kg** |
| Glomark | Chicken Breast | Rs 1,900 | 300g | **Rs 6,333/kg** |
| Cargills | Chicken Breast Skinless | Rs 720 | 500g | **Rs 1,440/kg** |

This app normalizes everything into a common schema with unit prices.

## Architecture

Hybrid ingestion -- each store uses the method that works for it:

| Store | Method | Bot Protection | Status |
|-------|--------|----------------|--------|
| **Keells** | Local Puppeteer + stealth (Cloudflare-protected) | Yes | 80 meat products captured |
| **Glomark** | Worker-native HTML fetch (server-rendered) | None | Ready to build |
| **Cargills** | Worker-native POST API (needs validation) | None | Needs investigation |

See [docs/architecture-big-picture.md](docs/architecture-big-picture.md) for the full diagram.

## Docs

| Document | Description |
|----------|-------------|
| [Product Brief](docs/product-brief.md) | Vision, problem, users, scope |
| [PRD](docs/prd.md) | Detailed requirements, API spec, milestones |
| [Architecture](docs/architecture-big-picture.md) | System design, ingestion strategies, schema |
| [Provider Rollout](docs/provider-rollout-plan.md) | Per-store implementation plan and phases |
| [Keells Provider](docs/keells-provider.md) | Keells API documentation and capture automation |

## Quick Start

```bash
npm install
npm test                                    # run tests
npm run dev                                 # start local Worker

npm run keells:capture -- --headless        # capture all Keells meat prices
npm run keells:capture -- --headless --dry-run  # preview without writing
```

## API

`GET /api/products` -- returns normalized products with unit pricing.

Key fields per product: `store`, `name`, `displayed_price_lkr`, `pack_qty`, `pack_unit`, `net_weight_g`, `price_per_kg_lkr`, `in_stock`, `captured_at`, `source_status`

## Current Status

- Keells: working (80 meat products via automated Puppeteer capture)
- Glomark: researched, ready for implementation
- Cargills: researched, API investigation needed
- Frontend: not yet built

## Project Structure

```
src/
  index.ts                  # Cloudflare Worker entry point
  schema.ts                 # TypeScript types
  normalize.ts              # Pack size parsing, unit price computation
  adapters/keells.seed.ts   # Fallback seeded data
  providers/keells.import.ts # Import parser and normalizer
scripts/
  keells-capture.mjs        # Automated Puppeteer capture
  keells-refresh.mjs        # Clipboard/file-based refresh
  keells-browser-export.mjs # Raw-to-import transform
  keells-browser-console-snippet.js  # Manual DevTools snippet
data/
  keells.meat.import.json   # Active Keells snapshot (80 products)
docs/
  product-brief.md          # Product vision
  prd.md                    # Detailed requirements
  architecture-big-picture.md  # System architecture
  provider-rollout-plan.md  # Implementation phases
  keells-provider.md        # Keells API docs
test/
  normalize.test.ts         # Normalization tests
  keells-browser-export.test.ts  # Transform tests
```
