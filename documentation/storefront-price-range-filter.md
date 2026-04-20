# Storefront Price-Range Filter

## Goal
Add a default price-range filter to live category listing pages in the storefront. The control should help shoppers narrow a category by the actual selling price they pay, not the original list price.

## User-Facing Behavior
- Live category pages render a `Price` filter above all configured facet groups.
- The control is a dual-handle slider with visible selected min/max values.
- The slider uses effective price:
  - discounted products contribute their discounted selling price
  - non-discounted products contribute their base price
- With no explicit price params in the URL, the slider defaults to the category-wide min/max bounds and the listing is unfiltered by price.
- Moving either handle updates the URL with `minPrice` and `maxPrice`, which triggers the existing category-page data reload flow.
- Non-live categories still render their coming-soon state and do not show price filtering.

## API and Interface Changes
`GET /products/facets` now returns:

```json
{
  "categoryId": "…",
  "categorySlug": "blouse",
  "priceRange": {
    "min": 799,
    "max": 2499
  },
  "facets": []
}
```

Notes:
- `priceRange` is `null` when no active priced variants exist in the category.
- Existing listing params remain unchanged:
  - `minPrice`
  - `maxPrice`
  - `facet.*`

## Backend Rules
- Price-range bounds are computed from the full active inventory in the resolved category.
- Bounds ignore current facet selections and ignore current `minPrice` / `maxPrice`.
- Listing filters apply `minPrice` and `maxPrice` against effective price.
- Facet counts still respect the current request context, including active price filters.

## Storefront Data Flow
1. Category page resolves the category from the category tree.
2. For live categories it fetches:
   - `/products?...&minPrice=...&maxPrice=...`
   - `/products/facets?...&minPrice=...&maxPrice=...`
3. The listing endpoint returns the filtered products.
4. The facets endpoint returns:
   - category-wide `priceRange`
   - filter-context-aware facet groups
5. The slider initializes from URL params when present, otherwise from `priceRange`.
6. Slider changes update the existing query-string-driven listing state.

## Acceptance Criteria
- Live category pages show the price slider above the other filters.
- Slider bounds match the live category’s category-wide effective min/max price.
- Discounted items are filtered by effective price, not original price.
- Reloading a URL with `minPrice` / `maxPrice` restores the same selected range.
- Other facet filters continue to work correctly with price filtering.
- Non-live categories do not render the price slider.
