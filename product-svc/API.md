# Product Service API

## Ownership
- `products`: product-level content such as title, slug, descriptions, category, shipping, care, return policy, and generic details
- `product_variants`: sellable variant data such as price, discount, colors, images, stock rows, and variant details
- `inventory`: operational stock snapshot used by admin inventory flows

## Runtime
- Local HTTPS port: `4445`
- Mounted behind gateway at:
  - `/products`
  - `/products/facets`
  - `/categories/:slug/products`
  - `/cart`
  - `/api/admin/products`

## Storefront Read APIs

### GET `/products`
List storefront products.

Supports:
- `categoryId=<ObjectId>`
- `categorySlug=<slug>`
- `featured=true`
- `facet.<key>=value1,value2`
- `minPrice=<number>`
- `maxPrice=<number>`
- `discountType=none|percent|flat`
- `discountMin=<number>`
- `discountMax=<number>`
- `limit=<number>`

List item shape:
- `_id`
- `title`
- `slug`
- `categoryId`
- `categorySlug`
- `shortDescription`
- `currency`
- `defaultVariant`
- `care`
- `returnPolicy`
- `availability`
- `colorSummary`
- `otherVariantColors`

`defaultVariant` includes:
- `variantId`
- `price`
- `effectivePrice`
- `discount`
- `imageUrl`
- `colors`
- `sizeLabel`

### GET `/products/:slug`
Storefront product detail.

Product shape includes:
- `_id`
- `title`
- `slug`
- `categorySlug`
- `description`
- `shortDescription`
- `currency`
- `images`
- `shipping`
- `care`
- `returnPolicy`
- `details`
- `defaultVariant`
- `variants`

Variant shape includes:
- `_id`
- `price`
- `effectivePrice`
- `discount`
- `isDefault`
- `isActive`
- `images`
- `colors`
- `sizeLabel`
- `details`
- `stock`
- `availability`

### GET `/categories/:slug/products`
Category-scoped list with the same payload shape as `GET /products`.

### GET `/products/facets`
Facet metadata for the current category/filter state.

Response envelope:
- `categoryId`
- `categorySlug`
- `priceRange`
- `facets`

`priceRange` shape:
- `min`
- `max`

`priceRange` is derived from category-wide effective prices and is not narrowed by the currently selected facet or price filters.

Facet shape:
- `key`
- `label`
- `type`
- `scope`
- `multiSelect`
- `options[]`

Option shape:
- `value`
- `label`
- `count`

Facet types currently used by the storefront:
- `enum`
- `boolean`

## Cart APIs
- `GET /cart`
- `POST /cart/items`
- `PATCH /cart/items/:itemId`
- `DELETE /cart/items/:itemId`

Cart response includes:
- `cartToken`
- `itemCount`
- `subtotal`
- `items`
- `expiresAt`
- `warnings`

## Admin APIs

### Product endpoints
- `GET /api/admin/products`
- `GET /api/admin/products/:id`
- `POST /api/admin/products`
- `PUT /api/admin/products/:id`
- `PATCH /api/admin/products/:id/publish`
- `DELETE /api/admin/products/:id`
- `GET /api/admin/products/facets`

### Variant endpoints
- `GET /api/admin/products/:id/variants`
- `POST /api/admin/products/:id/variants`
- `PATCH /api/admin/products/:id/variants/:variantId`

### Inventory endpoints
- `GET /api/admin/products/inventory/list`
  - Optional query params: `categoryId`, `productId`, `variantId`, `sizeLabel`, `search`, `page`, `limit`
  - `search` matches inventory `stockKey`, `sizeLabel`, and linked product `title` / `slug`
  - Response shape: `{ items, total, page, limit, totalPages }`
- `PATCH /api/admin/products/inventory/:id`

## Admin Write Model

### Product create/update
Core fields:
- `title`
- `slug`
- `categoryId`
- `tags`
- `currency`
- `description`
- `shortDescription`
- `images`
- `shipping.text`
- `care.text`
- `returnPolicy.text`
- `returnPolicy.returnable`
- `returnPolicy.windowDays`
- `details`
- `isFeatured`
- `isActive`

### Variant create/update
Core fields:
- `price`
- `discount`
- `images`
- `colors`
- `details`
- `stock`
- `isDefault`
- `isActive`

`discount` shape:
- `type`: `none | percent | flat`
- `value`
- `label`

`stock[]` row shape:
- `stockKey`
- `sizeLabel`
- `quantity`
- `reorderLevel`

## Notes
- Storefront responses are DTO-shaped; internal Mongo fields and removed legacy fields are not exposed
- Product list/detail responses carry the real `categorySlug` used by the storefront
- Pricing display should be based on `price`, `effectivePrice`, and `discount`
