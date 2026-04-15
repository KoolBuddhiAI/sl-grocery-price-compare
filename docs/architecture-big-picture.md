# Architecture Big Picture

## Design Principle

Use a **hybrid ingestion architecture** where each provider uses the extraction method that actually works for it, rather than forcing all providers through one pattern.

```
+===========================================================================+
|  INGESTION LAYER (per-provider, chosen by operational reality)            |
|                                                                           |
|  +------------------+  +------------------+  +------------------------+  |
|  | Glomark          |  | Cargills         |  | Keells                 |  |
|  | Worker-native    |  | Worker-native    |  | Local Puppeteer        |  |
|  | HTML fetch       |  | POST API calls   |  | + stealth plugin       |  |
|  | (no bot protect) |  | (no bot protect) |  | (Cloudflare-protected) |  |
|  +--------+---------+  +--------+---------+  +-----------+------------+  |
|           |                      |                        |               |
+===========|======================|========================|===============+
            |                      |                        |
            v                      v                        v
+===========================================================================+
|  NORMALIZATION LAYER                                                      |
|                                                                           |
|  - Parse product name, price, weight, stock                               |
|  - Normalize pack size: "Per 300g(s)" -> 300g, "1.3kg" -> 1300g          |
|  - Compute unit price: price_per_kg_lkr, price_per_l_lkr                 |
|  - Validate snapshot contract per provider                                |
|  - Stamp captured_at, source_status                                       |
|                                                                           |
+====================================+=====================================+
                                     |
                                     v
+===========================================================================+
|  STORAGE LAYER (Cloudflare KV)                                            |
|                                                                           |
|  snapshots/keells/meat      -> latest Keells meat snapshot                |
|  snapshots/glomark/meat     -> latest Glomark meat snapshot               |
|  snapshots/cargills/meat    -> latest Cargills meat snapshot              |
|  snapshots/merged/meat      -> merged cross-store comparison              |
|                                                                           |
+====================================+=====================================+
                                     |
                                     v
+===========================================================================+
|  API LAYER (Cloudflare Worker)                                            |
|                                                                           |
|  GET /api/products                 -> all products, all stores            |
|  GET /api/products?category=meat   -> filter by category                  |
|  GET /api/products?store=keells    -> filter by store                     |
|  GET /api/health                   -> per-store freshness + status        |
|                                                                           |
+====================================+=====================================+
                                     |
                                     v
+===========================================================================+
|  FRONTEND (Cloudflare Pages or Worker-embedded)                           |
|                                                                           |
|  - Category browse with cross-store price comparison                      |
|  - Package price + unit price side by side                                |
|  - Sort by unit price to find best value                                  |
|  - Source freshness indicators                                            |
|                                                                           |
+===========================================================================+
```

## Provider Ingestion Strategies

### Glomark -- Worker-Native HTML Fetch

**Why:** Server-rendered HTML with full product data. No bot protection. No JS rendering needed.

```
Cloudflare Cron Trigger
  -> Worker fetches https://glomark.lk/fresh/meat/c/144
  -> Parse server-rendered HTML for product cards
  -> Extract: name, price, weight, stock, product URL, image
  -> Normalize into snapshot contract
  -> Write to KV: snapshots/glomark/meat
```

Key technical details:
- URL pattern: `/fresh/meat/c/144`, `/fresh/fish/c/146`
- Product fields in HTML: name, price (LKR), weight, brand, stock status, image
- Pagination: "Show More" AJAX button (may need investigation for full listing)
- Product IDs: stable numeric IDs (e.g. `/chicken-breast/p/9154`)
- JSON-LD structured data available on product pages

### Cargills -- Worker-Native POST API (needs validation)

**Why:** No bot protection detected. Product data loaded via AJAX POST calls to `/Web/*` endpoints. If these endpoints work without browser session cookies, Worker can call them directly.

```
Cloudflare Cron Trigger
  -> Worker POSTs to /Web/GetSearchBarProductsV1 or category endpoint
  -> Parse JSON response
  -> Extract: ItemName, Price, UnitSize, UOM, Inventory, ItemImage
  -> Normalize into snapshot contract
  -> Write to KV: snapshots/cargills/meat
```

Key technical details:
- Backend: ASP.NET MVC, AngularJS frontend
- Product data NOT in HTML (template expressions only)
- POST endpoints: `/Web/GetCategoriesV1`, `/Web/GetSearchBarProductsV1`
- Product fields: `ItemName`, `Price`, `Mrp`, `UnitSize`, `UOM`, `Inventory`, `SKUCODE`
- Encoded IDs (`EnId`) -- may be session-dependent (needs testing)
- **Fallback:** if POST APIs need session cookies, use Puppeteer like Keells

### Keells -- Local Puppeteer + Stealth (already built)

**Why:** Cloudflare bot protection blocks all non-browser requests. Puppeteer with stealth plugin is the only reliable extraction method.

```
Local cron (every 6-12 hours)
  -> Puppeteer + stealth bypasses Cloudflare
  -> Establishes guest session
  -> Calls GetItemDetails API with itemsPerPage=200
  -> Extracts all products for department
  -> Transforms into snapshot contract
  -> Pushes to cloud (git push + deploy, or KV API upload)
```

Key technical details:
- API: `zebraliveback.keellssuper.com/2.0/WebV2/GetItemDetails`
- Auth: `cf_clearance` cookie + `usersessionid` header
- Meat dept ID: 12, itemsPerPage=200 gets all products in one call
- 80 meat products currently captured
- See `docs/keells-provider.md` for full API documentation

## Normalized Product Schema

Every product from every store normalizes into one shape:

```typescript
type NormalizedProduct = {
  id: string;                          // stable internal ID
  store: "keells" | "glomark" | "cargills";
  source_url: string;                  // link to product on store site
  source_product_id: string | null;    // store's SKU/product ID
  source_category: string;             // "meat", "seafood", "vegetables", etc.
  captured_at: string;                 // ISO timestamp of last capture
  source_status: SourceStatus;         // "ok" | "partial" | "blocked_or_unstable"

  name: string;                        // product name as shown on store
  displayed_price_lkr: number | null;  // package price in LKR
  displayed_currency: "LKR";
  in_stock: boolean | null;

  // Weight normalization
  raw_size_text: string | null;        // original text: "Per 300g(s)", "1kg"
  pack_qty: number | null;             // parsed quantity: 300, 1
  pack_unit: "g" | "kg" | "ml" | "l" | "unit" | "unknown";
  net_weight_g: number | null;         // normalized to grams (or ml for liquids)

  // Unit pricing (the key comparison metric)
  price_per_kg_lkr: number | null;     // price per kg for solids
  price_per_l_lkr: number | null;      // price per litre for liquids

  notes: string | null;
};
```

## Storage: Cloudflare KV

### Key structure

```
snapshots/{store}/{category}     -> ProviderSnapshot JSON
snapshots/merged/{category}      -> MergedSnapshot JSON (pre-computed)
meta/{store}                     -> { last_captured_at, source_status, product_count }
```

### Why KV (not D1)

- Latest-snapshot reads only -- no historical queries needed yet
- Simple key-value access pattern
- Free tier sufficient for initial traffic
- D1 later if historical price tracking becomes a requirement

## Freshness and Health

Every snapshot carries:

| Field | Meaning |
|-------|---------|
| `captured_at` | When the source data was last fetched |
| `source_status` | `ok`, `partial`, `blocked_or_unstable`, `not_found` |
| `product_count` | Number of products in snapshot |
| `extraction_mode` | `worker_fetch`, `worker_api`, `browser_assisted` |

The `GET /api/health` endpoint exposes per-store freshness so the frontend can show "Keells prices updated 3 hours ago" or warn when data is stale.

## Deployment

### Cloud (Cloudflare)

- **Worker**: API + Glomark/Cargills ingestion cron
- **KV**: snapshot storage
- **Pages** (optional): static frontend

### Local (operator machine)

- **Keells capture**: `npm run keells:capture -- --headless` via cron/launchd
- **Sync to cloud**: git push + GitHub Actions deploy, or direct KV API upload

See `docs/keells-provider.md` "Next Step: Local Cron + Auto-Deploy" for detailed sync options.
