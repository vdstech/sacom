# Product Service Architecture

## Purpose
`product-svc` owns product merchandising, storefront listing reads, carts, variants, and inventory.

## Bounded Responsibility
- product CRUD for admin
- variant CRUD and merchandising metadata
- storefront product detail and listing reads
- category facet aggregation
- category price-range aggregation
- cart state
- dedicated inventory records

## External Interfaces
- storefront: `/products`, `/products/:slug`, `/products/facets`, `/cart`
- admin: `/api/admin/products/*`

## Important Internal Modules
- `src/product/product.controller.js`
- `src/product/product.storefront.routes.js`
- `src/product/product.admin.routes.js`
- `src/product/defaultMetadata.js`
- `src/variant/variant.model.js`
- `src/inventory/inventory.model.js`
- `src/cart/cart.model.js`

## Pricing Model
Variant documents store:

- `price`
- `discount`

The final effective price is calculated at runtime in the product read layer. The storefront mirrors that same logic via shared price-display helpers.

## Price-Range Filter
`/products/facets` now returns:

- `categoryId`
- `categorySlug`
- `priceRange`
- `facets`

`priceRange` is computed from category-wide effective prices, not paginated results and not only from currently visible rows.

## Storage Ownership
- products
- product variants
- inventory
- carts

## Known Constraints and Debt
- Stock exists in two representations:
  - variant `stock[]`
  - inventory collection documents
- Effective price is computed at runtime instead of being materialized, which keeps writes simple but means every consumer must use the same helper logic.
- Product controller code carries a large amount of DTO and filter logic in one place; it is correct but dense.

## Relationship to Other Services
- category routing depends on `catalog-svc`
- storefront auth and customer ownership data depend on `auth-svc`
- public ingress runs through `gateway-svc`
