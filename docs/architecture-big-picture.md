# Architecture Big Picture

## Design Principle

Use a **hybrid ingestion architecture** where each provider uses the extraction method that actually works for it, rather than forcing all providers through one pattern. All providers write snapshots to Cloudflare KV. The Worker reads from KV to serve the API.

## System Diagram

```
 LOCAL MACHINE (Keells only — Cloudflare-protected)
 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  +------------------+
  | cron / launchd   |  Every 6-12 hours
  +--------+---------+
           |
           v
  +------------------+
  | keells-capture   |  Puppeteer + stealth
  | --headless       |  → 80 meat products
  +--------+---------+
           |
           |  POST /api/snapshots?key=SECRET
           |  (snapshot JSON body)
           |
 ~~~~~~~~~~|~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
           v
 CLOUDFLARE
 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

  +------------------+        +-----------------+       +------------------+
  | POST /api/       |        | Cron Trigger    |       | Cron Trigger     |
  | snapshots        |        | (daily 02:30    |       | (daily 02:30     |
  | (Keells push)    |        | UTC / 08:00     |       | UTC / 08:00      |
  |                  |        | Colombo)        |       | Colombo)         |
  +--------+---------+        +--------+--------+       +--------+---------+
           |                           |                         |
           |                  Glomark fetch              Cargills fetch
           |                  HTML parse                 Session + POST API
           |                  38 products                82 products
           |                  ~6s                        ~0.4s
           |                           |                         |
           v                           v                         v
  +====================================================================+
  |  CLOUDFLARE KV                                                     |
  |                                                                    |
  |  snapshots:keells:meat     → { provider, captured_at, items[] }    |
  |  snapshots:glomark:meat    → { provider, captured_at, items[] }    |
  |  snapshots:cargills:meat   → { provider, captured_at, items[] }    |
  +============================+=======================================+
                               |
                               v
  +====================================================================+
  |  WORKER API                                                        |
  |                                                                    |
  |  GET /api/products              → all 200 products, all stores     |
  |  GET /api/products?store=keells → filter by store                  |
  |  GET /api/health                → per-store freshness + counts     |
  |  POST /api/snapshots            → external push (Keells)           |
  |                                                                    |
  |  GET /api/glomark/fetch         → live fetch (debug/manual)        |
  |  GET /api/cargills/fetch        → live fetch (debug/manual)        |
  +============================+=======================================+
                               |
                               v
  +====================================================================+
  |  ASTRO FRONTEND (Cloudflare Pages)                                 |
  |                                                                    |
  |  /                     → homepage                                  |
  |  /meat                 → meat comparison (grouped by product type) |
  |  /meat/whole-chicken   → specific product type detail              |
  |                                                                    |
  |  React islands for: filters, sorting, store toggle                 |
  |  Tailwind CSS for styling                                          |
  +====================================================================+

 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
```

## Provider Summary (Verified)

| Store | Method | Bot Protection | Products | Fetch Time | Status |
|-------|--------|----------------|----------|------------|--------|
| **Keells** | Local Puppeteer + stealth → push to KV | Cloudflare | 80 | ~15s locally | Done |
| **Glomark** | Worker cron → HTML fetch → KV | None | 38 | ~6s | Done |
| **Cargills** | Worker cron → session + POST API → KV | None | 82 | ~0.4s | Done |
| **Total** | | | **200** | | |

## Data Flow: Glomark (Worker-Native)

```
Cron trigger (daily at 02:30 UTC / 08:00 Colombo)
  → fetch("https://glomark.lk/fresh/meat/c/144")
  → receive 960KB HTML with productList = [...] embedded in <script>
  → extractProductListFromHtml(html) → 38 raw products
  → transformGlomarkProducts(raw) → GlomarkImportedSnapshot
  → KV.put("snapshots:glomark:meat", snapshot)
```

All 38 products in one HTTP GET. No pagination, no auth, no session. The `productList` JSON is embedded in the page's inline JavaScript.

## Data Flow: Cargills (Worker-Native)

```
Cron trigger (daily at 02:30 UTC / 08:00 Colombo)
  → POST /Web/CheckDeliveryOptionV1 (PinCode=Colombo)
  → extract Set-Cookie headers (ASP.NET_SessionId, etc.)
  → POST /Web/GetMenuCategoryItemsPagingV3/ (CategoryId=MTE=, cookies)
  → receive JSON array of 82 products
  → transformCargillsProducts(raw) → CargillsImportedSnapshot
  → KV.put("snapshots:cargills:meat", snapshot)
```

Two HTTP calls: session bootstrap + product fetch. Session cookies are extracted manually from `Set-Cookie` headers (Workers-compatible, no cookie jar).

## Data Flow: Keells (External Push)

```
Local cron (every 6-12 hours, macOS launchd or crontab)
  → npm run keells:capture -- --headless
  → Puppeteer + stealth bypasses Cloudflare
  → establishes guest session via GuestLogin
  → calls GetItemDetails API (itemsPerPage=200)
  → 80 products captured
  → POST to Worker: /api/snapshots?key=SECRET
  → Worker writes to KV.put("snapshots:keells:meat", snapshot)
```

Keells capture MUST run locally because Cloudflare bot detection blocks all non-browser requests. The local script captures data then pushes the snapshot to the Worker via an authenticated POST endpoint.

## Storage: Cloudflare KV

### Key structure

```
snapshots:{store}:{category}  → ProviderSnapshot JSON
```

Examples:
- `snapshots:keells:meat` → Keells meat snapshot (80 products)
- `snapshots:glomark:meat` → Glomark meat snapshot (38 products)
- `snapshots:cargills:meat` → Cargills meat snapshot (82 products)

### Snapshot contract

Every snapshot in KV follows the same shape:

```json
{
  "provider": "keells",
  "category": "meat",
  "extraction_mode": "browser_assisted",
  "captured_at": "2026-04-15T06:49:21.340Z",
  "source_status": "ok",
  "items": [
    {
      "id": "...",
      "source_product_id": "...",
      "name": "...",
      "source_url": "...",
      "displayed_price_lkr": 1250,
      "raw_size_text": "300g",
      "in_stock": true,
      "notes": null
    }
  ]
}
```

### Why KV (not D1)

- Latest-snapshot reads only — no historical queries needed yet
- Simple key-value access pattern
- Free tier: 100k reads/day, 1k writes/day (plenty for 3 stores x 4 refreshes)
- D1 later if historical price tracking becomes a requirement

## API Endpoints

### Public (read)

| Endpoint | Description |
|---|---|
| `GET /api/products` | All products across all stores |
| `GET /api/products?store=keells` | Filter by store |
| `GET /api/products?store=glomark` | Filter by store |
| `GET /api/products?store=cargills` | Filter by store |
| `GET /api/health` | Per-store freshness, status, product counts |

### Internal (write)

| Endpoint | Description |
|---|---|
| `POST /api/snapshots` | Push snapshot to KV (requires `Authorization: Bearer <key>`) |

### Debug (manual fetch)

| Endpoint | Description |
|---|---|
| `GET /api/glomark/fetch` | Live fetch from glomark.lk (~6s) |
| `GET /api/cargills/fetch` | Live fetch from cargillsonline.com (~0.4s) |

## Cron Schedule

```
Worker cron: 30 2 * * * (daily at 02:30 UTC / 08:00 Colombo)
  → fetchGlomarkCategory("meat") → KV.put("snapshots:glomark:meat")
  → fetchCargillsCategory("meat") → KV.put("snapshots:cargills:meat")

Local cron: 0 */12 * * * (every 12 hours)
  → npm run keells:capture -- --headless
  → curl -X POST https://worker.dev/api/snapshots -H "Authorization: Bearer KEY" -d @data/keells.meat.import.json
```

## Freshness and Health

Every snapshot carries:

| Field | Meaning |
|-------|---------|
| `captured_at` | When the source data was last fetched |
| `source_status` | `ok`, `partial`, `blocked_or_unstable`, `not_found` |
| `extraction_mode` | `worker_fetch`, `browser_assisted` |

The `GET /api/health` endpoint exposes per-store freshness:

```json
{
  "stores": {
    "keells":   { "source_status": "ok", "captured_at": "...", "count": 80 },
    "glomark":  { "source_status": "ok", "captured_at": "...", "count": 38, "refresh_status": { "last_attempted_at": "...", "last_successful_at": "...", "last_error_message": null } },
    "cargills": { "source_status": "ok", "captured_at": "...", "count": 82, "refresh_status": { "last_attempted_at": "...", "last_successful_at": "...", "last_error_message": "cargills: product fetch non-200 (503)" } }
  }
}
```

For automatic Glomark and Cargills refreshes, health also carries the most recent attempt outcome and the last recorded error. Adapter failures now preserve stage-specific messages such as `glomark: productList missing from HTML`, `cargills: session bootstrap failed (...)`, `cargills: product fetch non-200 (...)`, or `cargills: JSON parse failed`.

The frontend shows a relative freshness label such as "Updated 3 hours ago", warns when data is older than 24 hours, and also renders the exact capture timestamp in `Asia/Colombo` (`UTC+5:30`) so the local interpretation is explicit.

## Product Type Mapping

Products are auto-categorized into ~26 types (e.g. "Whole Chicken", "Chicken Breast", "Beef Cubes") using keyword matching, with manual corrections stored in `data/product-type-mapping.json`.

```bash
npm run generate:product-types            # regenerate auto-mapping
npm run generate:product-types -- --update # preserve manual corrections
```

See the product type grouping design in the PRD for the frontend comparison layout.

## Frontend: Astro + React + Tailwind

- **Astro** on Cloudflare Pages (static by default, free tier)
- **React islands** for interactive components (filters, sorting)
- **Tailwind CSS** for styling
- Pages call the Worker API for data
- Product types grouped for cross-store comparison

## Wrangler Configuration

```jsonc
{
  "name": "price-compare-cloudflare",
  "main": "src/index.ts",
  "compatibility_date": "2026-04-12",
  "kv_namespaces": [
    { "binding": "SNAPSHOTS", "id": "<kv-namespace-id>" }
  ],
  "vars": {
    "SNAPSHOT_API_KEY": "<set-via-wrangler-secret>"
  },
  "triggers": {
    "crons": ["30 2 * * *"]
  }
}
```
