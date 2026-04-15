# Product Requirements Document (PRD)

## Overview

A Sri Lankan grocery price comparison website that aggregates product data from Keells, Glomark, and Cargills, normalizes it, and displays unit pricing so shoppers can find the most cost-effective option.

## Core Requirements

### R1: Multi-Store Data Ingestion

The system must ingest product data from three stores using the appropriate method per store.

| Store | Method | Refresh Cadence |
|-------|--------|-----------------|
| Keells | Local Puppeteer capture + push to cloud | Every 6-12 hours |
| Glomark | Cloudflare Worker cron + HTML fetch | Every 6 hours |
| Cargills | Cloudflare Worker cron + API POST (or Puppeteer fallback) | Every 6-12 hours |

Each ingestion run produces a **provider snapshot** containing all products for a category, stamped with `captured_at` and `source_status`.

### R2: Product Normalization

Every product must be normalized into a common schema regardless of source format.

**Required normalized fields:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Stable internal identifier |
| `store` | enum | "keells", "glomark", "cargills" |
| `name` | string | Product name as displayed by store |
| `source_url` | string | Direct link to product on store |
| `source_product_id` | string | Store's SKU or product code |
| `source_category` | string | Category: "meat", "seafood", etc. |
| `displayed_price_lkr` | number | Package price in LKR |
| `in_stock` | boolean | Availability |
| `captured_at` | string | ISO timestamp of capture |
| `source_status` | enum | ok, partial, blocked_or_unstable, not_found |

### R3: Weight and Size Normalization

Products are sold in different package sizes. The system must normalize weights so users can compare unit prices.

**Required weight fields:**

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `raw_size_text` | string | Original text from store | "Per 300g(s)" |
| `pack_qty` | number | Parsed numeric quantity | 300 |
| `pack_unit` | enum | g, kg, ml, l, unit, unknown | "g" |
| `net_weight_g` | number | Weight in grams (or ml for liquids) | 300 |
| `pack_weight_display` | string | Human-friendly display | "300g" |

**Supported input formats:**

| Format | Example | Parsed As |
|--------|---------|-----------|
| Grams | `300g`, `500 g` | 300g, 500g |
| Kilograms | `1kg`, `1.3kg` | 1000g, 1300g |
| Per-weight | `Per 300g(s)` | 300g |
| Millilitres | `500ml`, `250 ml` | 500ml |
| Litres | `1L`, `1.5l` | 1000ml, 1500ml |
| Count | `6 Pack`, `12 Pack` | 6 units, 12 units |
| Per piece | `Each`, `Per Piece` | 1 unit |
| Per kg (Keells meat) | (no weight, price is per kg) | Flag as per-kg pricing |

### R4: Unit Pricing

The key comparison metric. For every product where weight is known:

| Product Type | Unit Price Field | Computation |
|---|---|---|
| Solids (g/kg) | `price_per_kg_lkr` | `displayed_price_lkr / (net_weight_g / 1000)` |
| Liquids (ml/l) | `price_per_l_lkr` | `displayed_price_lkr / (net_weight_ml / 1000)` |
| Count-based | `price_per_unit_lkr` | `displayed_price_lkr / pack_qty` |
| Unknown weight | all null | Show package price only |

**Special case -- Keells fresh meat:**
Keells prices are already per-kg (the `amount` field from their API is the per-kg price). The system must recognize this and set `price_per_kg_lkr = amount` directly, not attempt to divide by weight.

### R5: API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /api/products` | GET | All products across all stores |
| `GET /api/products?category=meat` | GET | Filter by category |
| `GET /api/products?store=keells` | GET | Filter by store |
| `GET /api/products?category=meat&store=glomark` | GET | Combined filters |
| `GET /api/products?sort=unit_price` | GET | Sort by unit price (lowest first) |
| `GET /api/health` | GET | Per-store ingestion status and freshness |

**Response shape:**

```json
{
  "data": [
    {
      "id": "keells-937039",
      "store": "keells",
      "name": "Bairaha Half Chicken",
      "displayed_price_lkr": 1250,
      "raw_size_text": null,
      "pack_weight_display": "per kg",
      "price_per_kg_lkr": 1250,
      "in_stock": true,
      "source_url": "https://www.keellssuper.com/product/937039",
      "captured_at": "2026-04-15T06:14:34.045Z"
    }
  ],
  "meta": {
    "total": 240,
    "stores": {
      "keells":   { "status": "ok", "captured_at": "2026-04-15T06:14:34Z", "count": 80 },
      "glomark":  { "status": "ok", "captured_at": "2026-04-15T08:00:00Z", "count": 45 },
      "cargills": { "status": "ok", "captured_at": "2026-04-15T07:30:00Z", "count": 115 }
    }
  }
}
```

### R6: Frontend Requirements

A simple comparison website that enables:

1. **Category browsing** -- select meat, seafood, vegetables, etc.
2. **Cross-store comparison** -- see the same type of product across all three stores
3. **Unit price sorting** -- sort by price per kg/litre to find the best deal
4. **Dual price display** -- every product shows:
   - Package price: "Rs 720.00 (300g)"
   - Unit price: "Rs 2,400/kg"
5. **Store filtering** -- show/hide specific stores
6. **Freshness indicator** -- "Updated 3 hours ago" per store
7. **Stock status** -- clearly mark out-of-stock items

### R7: Data Freshness

- Each store's data must be refreshed at least every 12 hours
- The API must expose when each store was last updated
- The frontend must warn when data is older than 24 hours
- Stale stores should still be shown (with a warning), not hidden

## Categories (MVP)

| Category | Keells Dept | Glomark Path | Cargills |
|----------|-------------|--------------|----------|
| Meat | dept ID 12 | `/fresh/meat/c/144` | TBD |
| Seafood | dept ID 4 | `/fresh/fish/c/146` | TBD |
| Vegetables | dept ID 16 | `/fresh/dp/16` (vegetables) | TBD |
| Fruits | dept ID 6 | `/fresh/dp/16` (fruits) | TBD |

Start with meat only, expand after the pipeline is proven.

## Non-Functional Requirements

- **Performance**: API response < 200ms (reads from KV, no upstream fetches on user requests)
- **Availability**: Cloudflare Worker uptime (99.9%+)
- **Cost**: stay within Cloudflare free tier initially (100k Worker requests/day, 1GB KV storage)
- **Respectful scraping**: max 1 request every 5-10 seconds per store during refresh, with jitter. Stop on repeated 403/429.

## Milestones

| Milestone | Deliverable | Stores |
|-----------|-------------|--------|
| M1 (current) | Keells capture working, API serving Keells data | Keells |
| M2 | Glomark Worker-native adapter, KV storage, merged API | Keells + Glomark |
| M3 | Cargills adapter (Worker or Puppeteer) | All three |
| M4 | Frontend comparison website | All three |
| M5 | Category expansion (seafood, vegetables) | All three |
| M6 | Hardening (alerts, retry, health checks) | All three |
