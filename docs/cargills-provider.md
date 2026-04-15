# Cargills Provider

Provider for extracting product and pricing data from [Cargills Online](https://cargillsonline.com).

## Architecture

Cargills is an ASP.NET MVC backend with AngularJS frontend. Product data is NOT in the HTML — it's loaded via AJAX POST calls. However, there is **no bot protection**, so Worker-native POST calls work once a session is established.

```
Cloudflare Worker
  |
  |  1. POST /Web/CheckDeliveryOptionV1  (PinCode=Colombo)
  |     -> Sets session cookies (ASP.NET_SessionId, Pincode, StoreId)
  |
  |  2. POST /Web/GetMenuCategoryItemsPagingV3/
  |     -> CategoryId=MTE= (base64 of "11" = Meat)
  |     -> Returns ALL products (pagination ignored)
  |
  v
Transform into snapshot contract
  |
  v
Write to KV / data file
```

## Session Bootstrap

**Required before product data works.** Without session cookies, product endpoints return empty results.

```
POST https://cargillsonline.com/Web/CheckDeliveryOptionV1
Content-Type: application/x-www-form-urlencoded

PinCode=Colombo
```

Response sets 4 cookies:
- `ASP.NET_SessionId` (HttpOnly)
- `ASP.NET_Pincode=Colombo`
- `ASP.NET_WebStoreType=1`
- `Asp.Net_WebStoreId=1031`

All subsequent API calls must include these cookies.

## API Endpoints

### Categories

```
POST /Web/GetCategoriesV1
```

Returns 24 top-level categories. Key fields:
- `MenuCategoryName`: display name
- `EnId`: base64-encoded category ID
- `Abbreviation`: 2-letter code (e.g. "MT" for Meats)

### Product Listing (primary endpoint)

```
POST /Web/GetMenuCategoryItemsPagingV3/
Content-Type: application/x-www-form-urlencoded

CategoryId=MTE=&Search=&Filter=&PageIndex=1&PageSize=100&BannerId=&SectionId=&CollectionId=&SectionType=&DataType=&SubCatId=&PromoId=
```

**PageSize is ignored** — the API returns ALL products for the category in one call.

### Subcategories

```
POST /Web/GetSubCategories/
Content-Type: application/x-www-form-urlencoded

CategoryId=MTE=
```

### ID Encoding

All IDs are **base64-encoded plain integers**:

| Category | Integer ID | Base64 |
|----------|-----------|--------|
| Meats | 11 | `MTE=` |
| Vegetables | 23 | `MjM=` |
| Seafood | (TBD) | (TBD) |
| Fruits | (TBD) | (TBD) |

Encode: `btoa("11")` → `MTE=`

## Product Fields

| Field | Type | Description |
|-------|------|-------------|
| `ItemName` | string | Product name |
| `Price` | string | Selling price (e.g. "790.00") |
| `Mrp` | string | Original price ("0.00" if no discount) |
| `DiscountAmount` | string | Discount (e.g. "40.00%") |
| `SKUCODE` | string | Unique SKU (e.g. "VGE0201") |
| `UnitSize` | number | Numeric size (e.g. 500) |
| `UOM` | string | Unit of measure ("g", "ml", "l") |
| `PackSize` | string | Pack size info |
| `Inventory` | number | Stock count |
| `ItemImage` | string | Image path (prefix with site URL) |
| `CategoryCode` | string | 2-letter category code |
| `EnId` | string | AES-encrypted product ID |
| `MaxOrderQuantity` | number | Max orderable |
| `MinOrderQuantity` | number | Min orderable |
| `TotalCount` | number | Total products in category |

## Implementation Plan

1. POST `CheckDeliveryOptionV1` to bootstrap session cookies
2. POST `GetMenuCategoryItemsPagingV3/` with `CategoryId=MTE=` (Meat)
3. Parse JSON response array
4. Transform each item: `ItemName` → name, `Price` → price, `UnitSize` + `UOM` → weight
5. Write snapshot to KV

### Unit Price Computation

```
displayed_price_lkr = parseFloat(Price)
raw_size_text = UnitSize + UOM  (e.g. "500g")
price_per_kg_lkr = displayed_price_lkr / (UnitSize / 1000)  [when UOM is "g"]
```

## Implementation Status: Complete

The adapter is built and verified. Live fetch returns 82 meat products in ~0.4s.

### Adapter: `src/adapters/cargills.fetch.ts`

- `bootstrapSession()` — POSTs to `CheckDeliveryOptionV1`, extracts `Set-Cookie` headers manually (Workers-compatible, no cookie jar)
- `extractCookies(response)` — parses `Set-Cookie` headers into a `Cookie` header string
- `encodeCategoryId(id)` — base64-encodes category integer (`btoa("11")` → `MTE=`)
- `parsePrice(priceStr)` — handles comma-separated prices (`"1,192.00"` → `1192`)
- `fetchCargillsCategory(category)` — full pipeline: session → fetch → transform → snapshot
- `transformCargillsProducts(raw, options)` — converts raw API array to `CargillsImportedSnapshot`

### Import Provider: `src/providers/cargills.import.ts`

- `parseCargillsImportedSnapshot(value)` — runtime validation
- `normalizeCargillsImportedSnapshot(snapshot)` — transforms to `NormalizedProduct[]`
- `getImportedCargillsMeatProducts()` — loads from `data/cargills.meat.import.json`
- `getImportedCargillsSnapshotMeta()` — extracts metadata

### Worker Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/products?store=cargills` | Cargills products from static import |
| `GET /api/cargills/fetch` | Live fetch from Cargills API (0.4s) |
| `GET /api/health` | Includes Cargills status and freshness |

## Known Details

- 82 meat products currently captured
- Total catalog: ~3,841 products across 24 categories
- No bot protection or Cloudflare
- Prices can contain commas (e.g. "1,192.00") — handled by `parsePrice()`
- AES encryption uses hardcoded key/IV (`8080808080808080`) — not needed for product listing
- Session cookies are short-lived; each cron run bootstraps a fresh session
- `PinCode=Colombo` works as a default delivery area
- Live fetch completes in ~0.4 seconds

## Files

| File | Purpose |
|---|---|
| `docs/cargills-provider.md` | This documentation |
| `src/adapters/cargills.fetch.ts` | Fetch adapter (session bootstrap + API calls) |
| `src/providers/cargills.import.ts` | Import parser and normalizer |
| `data/cargills.meat.import.json` | Active snapshot (82 products) |
| `test/cargills.test.ts` | 11 tests |
