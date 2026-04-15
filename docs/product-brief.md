# Product Brief

## Summary

Build a Sri Lankan grocery price comparison website that helps shoppers find the most cost-effective products across Keells, Glomark, and Cargills. The app normalizes inconsistent product names, pack sizes, and pricing into a unified view with base-weight unit pricing (per kg, per litre, per unit).

## Problem

Sri Lankan grocery shoppers face three compounding problems:

1. **Fragmented pricing** -- comparing prices requires visiting three separate storefronts (Keells, Glomark, Cargills), each with different layouts and navigation
2. **Inconsistent naming** -- the same product is described differently across stores (e.g. "Chicken Breast Skinless" vs "Boneless Chicken Breast" vs "Chicken Breast Meat Boneless")
3. **Hidden unit economics** -- products are sold in different package sizes (300g, 500g, 1kg, per piece) making it impossible to compare cost-effectiveness at a glance without mental math

## Users

- **Price-sensitive household shoppers** who want to find the cheapest option for a specific product across stores, or the best value per kg/litre
- **Budget planners** who want to compare a basket of common items across stores
- **Operators** who maintain the ingestion pipeline and need source health/freshness signals

## Solution

A read-only comparison website and API that:

- fetches product data from all three stores on a schedule
- normalizes product names, categories, and pack sizes into a common schema
- computes **base-weight unit pricing** (price per kg for solids, price per litre for liquids, price per unit for count-based items) so shoppers can compare cost-effectiveness regardless of package size
- displays products grouped by category with cross-store price comparison
- shows both the **package price** and the **unit price** so users can pick the most cost-effective option
- surfaces data freshness and source health per store

## Normalization Requirements

### Product naming

Products across stores will have different descriptions for the same item. The system must support:

- displaying each store's original product name
- grouping similar products for comparison (manual mapping initially, automated matching later)

### Weight and unit normalization

Every product must display:

| Field | Description | Example |
|-------|-------------|---------|
| `raw_size_text` | Original size text from store | "Per 300g(s)", "500 g", "1kg" |
| `pack_weight_g` | Package weight in grams | 300, 500, 1000 |
| `pack_weight_display` | Human-readable package weight | "300g", "500g", "1kg" |
| `base_unit` | Normalization unit | "kg", "l", "unit" |
| `price_per_base_unit_lkr` | Price per kg/litre/unit | 2400.00 |

Supported input formats: `300g`, `500 g`, `1kg`, `1.3kg`, `Per 300g(s)`, `1L`, `500ml`, `6 Pack`

### Price display

For every product, show:

- **Package price**: "Rs 720.00 for 300g"
- **Unit price**: "Rs 2,400/kg"
- **Store**: which store this price is from
- **Freshness**: when the price was last captured

## Scope

### In scope (MVP)

- Three stores: Keells, Glomark, Cargills
- Categories: start with meat, expand to seafood, vegetables, fruits, beverages
- Public read-only API (`GET /api/products`, `GET /api/products?category=meat&store=keells`)
- Simple comparison frontend on Cloudflare Pages or embedded in Worker
- Automated ingestion on a schedule (6-12 hours)
- Source health and freshness metadata per store

### Out of scope (MVP)

- User accounts, auth, cart, or checkout
- Historical price tracking or trends
- Full-site product discovery (curated categories first)
- Automated product name matching across stores (manual mapping first)
- Real-time prices (snapshot-based, refreshed periodically)
- Mobile app

## Success Metrics

- All three stores returning data with `source_status: ok`
- At least meat category fully covered across all three stores
- Unit prices computed for 80%+ of products where weight is available
- Data refreshed within the last 12 hours

## Current Status

- Keells: working automated capture via Puppeteer (80 meat products, local cron)
- Glomark: researched, server-rendered HTML, no bot protection, ready for Worker-native adapter
- Cargills: researched, AngularJS SPA with POST APIs, no bot protection, needs API investigation
- Worker: serves Keells data via `GET /api/products`
- Frontend: not yet built
