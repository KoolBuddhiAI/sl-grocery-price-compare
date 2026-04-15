# Glomark Provider

Provider for extracting product and pricing data from [Glomark](https://glomark.lk).

## Architecture

Glomark is the simplest provider: **server-rendered HTML with all product data embedded as JSON in an inline script**. No bot protection, no API auth, no JS rendering needed. A single HTTP GET returns every product for a category.

```
Cloudflare Worker (or local fetch)
  |
  |  GET https://glomark.lk/fresh/meat/c/144
  |
  v
Server returns full HTML (~960KB) containing:
  - Rendered product cards in DOM
  - Complete productList JSON array in <script> tag
  - All products for the category (no pagination needed)
  |
  |  Parse: extract productList = [...] from inline JS
  |
  v
Transform into snapshot contract
  |
  v
Write to KV / data file
```

## Data Source

### Extraction method

The page embeds ALL category products in a JavaScript variable:

```javascript
productList = [
  {
    "id": 9154,
    "name": "Chicken Breast",
    "price": 564,
    "displayQuantity": 300,
    "unit": "g",
    "stock": 1767792,
    "isOutOfStock": false,
    "erpCode": "340016",
    "conversionFactor": 0.001,
    "brandDetails": { "id": 1394, "name": "GLOMARK" },
    "categoryDetails": { "id": 144, "name": "Meat" },
    "subCategoryDetails": { "id": 793, "name": "Poultry" },
    "image": "340016--01--1549602521.jpeg",
    "promoPrice": 564,
    "promoRate": null,
    "applicablePrice": 564,
    ...
  },
  ...
];
```

The "Show More" button on the page is purely client-side — it reveals items already in the array. No AJAX pagination needed.

### Category URLs

| Category | URL | Products (approx) |
|----------|-----|-------------------|
| Meat | `/fresh/meat/c/144` | ~34 |
| Fish | `/fresh/fish/c/146` | TBD |
| Frozen Meat | `/frozen/processed---preserved-meat/c/151` | TBD |
| Frozen Fish | `/frozen/processed---preserved-fish/c/154` | TBD |
| Vegetables | (under `/fresh/dp/16`) | TBD |
| Fruits | (under `/fresh/dp/16`) | TBD |

Subcategories within Meat (category 144):
- Poultry (id: 793)
- Beef (id: 789)
- Pork (id: 792)
- Ready To Cook (id: 795)

### Product URL pattern

```
https://glomark.lk/{slug}/p/{id}
```

Example: `https://glomark.lk/chicken-breast/p/9154`

### Image URL pattern

```
https://objectstorage.ap-mumbai-1.oraclecloud.com/n/softlogicbicloud/b/cdn/o/products/{size}/{image}
```

Sizes: `140-140` (thumbnail), full size without size prefix.

## Product Fields

| Field | JSON Path | Type | Description |
|-------|-----------|------|-------------|
| Product ID | `id` | number | Stable numeric ID |
| Name | `name` | string | Product display name |
| SKU | `erpCode` | string | ERP/SKU code |
| Price | `price` | number | Price in LKR for the display quantity |
| Promo Price | `promoPrice` | number | Promotional price (same as price if no promo) |
| Promo Rate | `promoRate` | number/null | Discount percentage (null if no promo) |
| Applicable Price | `applicablePrice` | number | Effective price after promotions |
| Display Quantity | `displayQuantity` | number | Package weight (grams for `unit: "g"`, count for `unit: "unit"`) |
| Unit | `unit` | string | `"g"` for weight-based, `"unit"` for count-based |
| Conversion Factor | `conversionFactor` | number | `0.001` for grams (g->kg), `1` for units |
| Stock | `stock` | number | Total stock in grams (or units) |
| Out of Stock | `isOutOfStock` | boolean | Availability flag |
| Brand | `brandDetails.name` | string | Brand name (e.g. "GLOMARK", "BAIRAHA", "CIC") |
| Category | `categoryDetails.name` | string | Category name (e.g. "Meat") |
| Subcategory | `subCategoryDetails.name` | string | Subcategory (e.g. "Poultry", "Beef", "Pork") |
| Image | `image` | string | Image filename |
| Min Order | `minOrderLevel` | number | Minimum order in grams |
| Max Order | `maxOrderLevel` | number | Maximum order in grams |
| Increment | `increment` | number | Order increment (usually 100g) |
| Branch Stocks | `branchStocks` | array | Per-branch stock levels |

## Weight and Pricing

Glomark products have explicit weight data:

- `displayQuantity`: the package weight in grams (e.g. 300 = 300g)
- `unit`: `"g"` for weight-based, `"unit"` for count-based items
- `price`: price in LKR for that `displayQuantity`

**Unit price computation:**

```
price_per_kg_lkr = price / (displayQuantity / 1000)
```

Example: Chicken Breast at Rs 564 for 300g = Rs 1,880/kg

**Count-based items** (e.g. "Crispy Popcorn", `unit: "unit"`, `displayQuantity: 1`):
- These are priced per unit, not per weight
- `price_per_kg_lkr` = null
- Show package price only

## Bot Protection

**None.** Direct HTTP fetch returns full HTML with all product data:

```bash
curl -s "https://glomark.lk/fresh/meat/c/144" | wc -c
# 963732 bytes
```

No Cloudflare, no challenge pages, no session required. This works from Cloudflare Workers.

## JSON-LD Structured Data

Product detail pages include JSON-LD:

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "productID": "9154",
  "name": "Chicken Breast",
  "brand": "GLOMARK",
  "offers": [{
    "@type": "Offer",
    "price": "1900",
    "priceCurrency": "LKR",
    "availability": "https://schema.org/InStock"
  }]
}
```

Note: the JSON-LD price may differ from the listing price (JSON-LD shows per-kg price, listing shows per-displayQuantity price). Use the `productList` JSON as the authoritative source.

## Files

| File | Purpose |
|---|---|
| `docs/glomark-provider.md` | This documentation |
| `src/adapters/glomark.ts` | Glomark adapter (to be built) |
| `src/providers/glomark.import.ts` | Import parser (to be built) |
