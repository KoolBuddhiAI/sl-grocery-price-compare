# Keells Provider

Provider for extracting product and pricing data from [Keells Online](https://www.keellssuper.com).

## Architecture

### Current: Local Capture + Static Import

Keells is protected by Cloudflare bot detection, which blocks direct HTTP requests from cloud environments (Cloudflare Workers, AWS Lambda, etc.). A real browser session with stealth mode is required to obtain the `cf_clearance` cookie. This means the capture **must run locally** on a machine with a browser.

```
 LOCAL MACHINE
 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
                                  +-----------------------+
                                  |   keellssuper.com     |
                                  |   (React SPA)         |
                                  +----------+------------+
                                             |
                            Cloudflare bot protection (cf_clearance)
                                             |
                                             v
  +------------------+          +----------------------------+
  | keells-capture   |  ------> | zebraliveback.keellssuper  |
  | (Puppeteer +     |  session |   .com/2.0/WebV2/          |
  |  stealth plugin) |  + fetch |   GetItemDetails           |
  +--------+---------+          +-------------+--------------+
           |                                  |
           |  raw JSON                        |  JSON API response
           v                                  v
  +------------------+          +----------------------------+
  | keells-browser-  |          | result.itemDetailResult    |
  | export.mjs       |          |   .itemDetails[]           |
  | (transform)      |          +----------------------------+
  +--------+---------+
           |
           v
  +------------------+
  | data/keells.meat |
  | .import.json     |
  +--------+---------+
           |
 ~~~~~~~~~~|~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
           |  git commit + push / wrangler deploy
           v
 CLOUDFLARE
 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  +------------------+       +-------------------+
  | keells.import.ts | ----> | normalize.ts      |
  | (parse+validate) |       | (pack size, price |
  +------------------+       |  per kg)          |
                             +--------+----------+
                                      |
                                      v
                             +-------------------+
                             | GET /api/products |
                             | (Worker)          |
                             +-------------------+
 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
```

### Next Step: Local Cron + Auto-Deploy

The goal is to automate the full refresh cycle: capture prices locally on a schedule, then push the updated snapshot to the cloud without manual intervention.

```
 LOCAL MACHINE (always-on Mac / Raspberry Pi / home server)
 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

  +-------------------+
  | cron / launchd     |   Runs on schedule (e.g. every 6-12 hours)
  | (system scheduler) |
  +--------+----------+
           |
           v
  +-------------------+     +-------------------------+
  | keells-capture    | --> | keells.meat.import.json  |
  | --headless        |     | (updated with fresh      |
  +-------------------+     |  prices)                 |
                            +------------+------------+
                                         |
                                         v
                            +-------------------------+
                            | keells-sync.mjs         |  <-- new script
                            | 1. git add + commit     |
                            | 2. git push             |
                            | 3. wrangler deploy      |
                            |    (or trigger GH       |
                            |     Actions deploy)     |
                            +------------+------------+
                                         |
 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~|~~~~~~~~~~~~~~~~~
                                         v
 CLOUDFLARE
 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
                             +-------------------+
                             | Worker serves     |
                             | fresh prices via  |
                             | GET /api/products |
                             +-------------------+
 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
```

**Implementation options for the sync step:**

| Approach | How it works | Complexity |
|---|---|---|
| **Git push + GitHub Actions** | Capture script commits updated JSON and pushes. A GitHub Actions workflow triggers `wrangler deploy` on push. | Low -- reuses existing CI/CD. Snapshot is version-controlled. |
| **Direct `wrangler deploy`** | Capture script calls `wrangler deploy` after writing the JSON. No git involved. | Lowest -- but no version history of price snapshots. |
| **KV upload** | Capture script uploads the JSON directly to Cloudflare KV via the API. Worker reads from KV instead of a static import. | Medium -- requires KV binding and API token, but decouples deploy from data refresh. |

**Implementation options for the local scheduler:**

| Platform | Scheduler | Setup |
|---|---|---|
| macOS | `launchd` plist or `crontab -e` | `0 */6 * * * cd /path/to/repo && npm run keells:capture -- --headless` |
| Linux | `cron` | Same crontab entry |
| Cross-platform | Node.js `node-cron` wrapper script | Runs as a long-lived process, useful if cron is not available |

This approach keeps the browser-dependent capture local while the Worker remains a simple, stateless API server.

## Keells Backend API

The Keells Online storefront is a React SPA backed by a REST API.

### Base URL

```
https://zebraliveback.keellssuper.com/2.0/WebV2/
```

### Authentication

1. The SPA calls `POST /1.0/Login/GuestLogin` on page load.
2. The response includes a `userSessionID` (UUID).
3. Subsequent API calls pass this as the `usersessionid` request header.
4. The site is protected by Cloudflare. The browser receives `cf_clearance` and `__cf_bm` cookies after passing the challenge. These cookies must be present on API requests.

### Product Listing Endpoint

```
GET /2.0/WebV2/GetItemDetails
```

**Query parameters:**

| Parameter              | Example        | Description                             |
|------------------------|----------------|-----------------------------------------|
| `pageNo`               | `1`            | Page number (1-indexed)                 |
| `itemsPerPage`         | `200`          | Items per page (max observed: 200)      |
| `outletCode`           | `SCDR`         | Store outlet code (Darley Road default) |
| `departmentId`         | `12`           | Department ID (see table below)         |
| `subDepartmentId`      | (empty)        | Sub-department filter                   |
| `categoryId`           | (empty)        | Category filter                         |
| `itemPricefrom`        | `0`            | Price range lower bound                 |
| `itemPriceTo`          | `99999`        | Price range upper bound                 |
| `isFeatured`           | `0`            | Featured items only                     |
| `isPromotionOnly`      | `false`        | Promotion items only                    |
| `sortBy`               | `default`      | Sort order                              |
| `isShowOutofStockItems`| `true`         | Include out-of-stock items              |

**Department IDs:**

| Department  | ID  | Code | URL Slug           |
|-------------|-----|------|---------------------|
| Meat        | 12  | M    | `keells-meat-shop`  |
| Seafood     | 4   | S    | `fresh-fish`        |
| Vegetables  | 16  | V    | `fresh-vegetables`  |
| Fruits      | 6   | F    | `fresh-fruits`      |
| Beverages   | 2   | B    | `beverages`         |

**Response shape:**

```json
{
  "statusCode": 200,
  "result": {
    "itemDetailResult": {
      "pageCount": 1,
      "itemDetails": [
        {
          "orderId": 0,
          "itemID": 75337,
          "itemCode": "937039",
          "name": "Bairaha Half Chicken",
          "longDescription": "BAIRAHA HALF CHICKEN",
          "amount": 1250.00,
          "imageUrl": "https://essstr.blob.core.windows.net/essimg/350x/Small/Pic937039.jpg",
          "isFeatured": false,
          "isSponsored": false,
          "minQty": 0.70,
          "maxQty": 999.00,
          "slabQty": 0.70,
          "isOutOfStock": false
        }
      ]
    }
  }
}
```

**Key item fields:**

| Field              | Type    | Description                              |
|--------------------|---------|------------------------------------------|
| `itemCode`         | string  | Unique product SKU                       |
| `name`             | string  | Product display name                     |
| `amount`           | number  | Price in LKR (per KG for fresh meat)     |
| `isOutOfStock`     | boolean | Stock availability                       |
| `minQty`           | number  | Minimum order quantity (KG)              |
| `maxQty`           | number  | Maximum order quantity                   |
| `slabQty`          | number  | Quantity increment                       |
| `imageUrl`         | string  | Product image URL                        |
| `longDescription`  | string  | Uppercase product description            |

## Capture Modes

### 1. Automated Capture (Recommended)

Uses Puppeteer with the stealth plugin to bypass Cloudflare, establish a session, and call the product API directly.

```bash
npm run keells:capture -- --headless          # capture all meat products
npm run keells:capture -- --headless --dry-run # preview without writing
npm run keells:capture -- --category seafood   # different category
```

**What it does:**

1. Launches a headless browser with `puppeteer-extra-plugin-stealth`
2. Navigates to `keellssuper.com/{category-slug}` to pass the Cloudflare challenge
3. Captures the `userSessionID` from the `GuestLogin` API response
4. Calls `GetItemDetails` with `itemsPerPage=200` from within the page context (inheriting Cloudflare cookies)
5. Normalizes each API item into the raw capture format
6. Transforms via `keells-browser-export.mjs` into the import snapshot contract
7. Writes `data/keells.meat.import.json`
8. Runs tests

**Flags:**

| Flag                      | Default   | Description                    |
|---------------------------|-----------|--------------------------------|
| `--headless`              | off       | Run browser without UI         |
| `--dry-run`               | off       | Print output, don't write file |
| `--category <name>`       | `meat`    | Category to capture            |
| `--source-status <status>`| `ok`      | Status to stamp on snapshot    |

### 2. Manual Clipboard Refresh

For cases where automated capture fails or you have raw JSON from a manual DevTools session.

```bash
pbpaste | npm run keells:refresh                # macOS: pipe clipboard JSON
npm run keells:refresh -- --file raw-data.json  # from a file
npm run keells:refresh -- --dry-run             # preview
```

### 3. Manual DevTools Snippet

The original manual workflow. Paste `scripts/keells-browser-console-snippet.js` into DevTools Console on a Keells product listing page. Copy the resulting JSON and pipe it through `keells:refresh`.

## Data Pipeline

### Raw Capture to Import Snapshot

The transform script (`scripts/keells-browser-export.mjs`) accepts flexible input field names and normalizes them into the strict import contract.

**Input fields accepted** (first match wins):

| Target Field          | Accepted Input Names                                          |
|-----------------------|---------------------------------------------------------------|
| `name`                | `name`, `title`                                               |
| `source_url`          | `source_url`, `url`, `link`                                   |
| `displayed_price_lkr` | `displayed_price_lkr`, `price`, `price_lkr`                   |
| `raw_size_text`       | `raw_size_text`, `size`, `weight`, `pack`                     |
| `in_stock`            | `in_stock`, `inStock`, `available`, `availability`            |
| `source_product_id`   | `source_product_id`, `productId`, `product_id`, `sku`         |

**Price parsing** handles: `1250`, `"Rs. 2,150.00"`, `"Rs 980"`, `1980.00`

**Stock parsing** handles: `true/false`, `"In Stock"/"Out of Stock"`, `"available"/"sold out"`

### Import Snapshot Contract

The file `data/keells.meat.import.json` must conform to:

```typescript
type KeellsImportedSnapshot = {
  provider: "keells";
  category: "meat";
  extraction_mode: "browser_assisted";
  captured_at: string;                    // ISO 8601
  source_status: "ok" | "partial" | "blocked_or_unstable" | "not_found";
  items: Array<{
    id: string;
    source_product_id: string | null;
    name: string;
    source_url: string;
    displayed_price_lkr: number | null;
    raw_size_text: string | null;
    in_stock: boolean | null;
    notes?: string | null;
  }>;
};
```

Validated at runtime by `parseKeellsImportedSnapshot()` in `src/providers/keells.import.ts`.

### Normalization

After import validation, each item is normalized via `normalizeKeellsProduct()` in `src/normalize.ts`:

- Parses `raw_size_text` into `pack_qty`, `pack_unit`, `net_weight_g`
- Computes `price_per_kg_lkr = displayed_price_lkr / (net_weight_g / 1000)`
- Returns `null` for `price_per_kg_lkr` when weight is unknown

**Supported size formats:** `300g`, `500 g`, `1kg`, `1.3kg`, `Per 300g(s)`

### Fallback

If the import snapshot is missing or invalid, the Worker falls back to seeded sample data from `src/adapters/keells.seed.ts`.

## Files

| File | Purpose |
|---|---|
| `scripts/keells-capture.mjs` | Automated Puppeteer capture script |
| `scripts/keells-refresh.mjs` | Clipboard/file-based refresh script |
| `scripts/keells-browser-export.mjs` | Raw-to-import transform logic |
| `scripts/keells-browser-console-snippet.js` | Manual DevTools capture snippet |
| `data/keells.meat.import.json` | Active import snapshot (consumed by Worker) |
| `data/keells.browser-raw.sample.json` | Reference raw capture sample |
| `data/keells.meat.import.from-raw.sample.json` | Reference transformed sample |
| `src/providers/keells.import.ts` | Import parser and normalizer |
| `src/adapters/keells.seed.ts` | Fallback seeded data |
| `src/normalize.ts` | Pack size parsing and price-per-kg computation |
| `src/schema.ts` | TypeScript type definitions |

## Known Limitations

- **Cloudflare protection**: Direct HTTP requests (curl, fetch from Workers) are blocked. A real browser session with stealth mode is required to obtain the `cf_clearance` cookie.
- **No weight data in API**: The Keells meat API returns `amount` as price per KG but does not include a pack weight field. Products are sold by weight (KG) at the counter, so `raw_size_text` is `null` and `price_per_kg_lkr` cannot be computed from the import snapshot alone. The `amount` field itself is the per-KG price.
- **Outlet-specific pricing**: Prices may vary by outlet. The capture defaults to `SCDR` (Darley Road). Other outlet codes can be used by modifying the script.
- **Session expiry**: The `userSessionID` and Cloudflare cookies are short-lived. Each capture run establishes a fresh session.
