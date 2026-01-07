# Product Service API

## Ownership & data dependencies
- **Product**: owned by `product-svc` (`products` collection).
- **Variant**: owned by `product-svc` (`product_variants` collection).
- **Inventory availability**: stored in `inventory` collection and managed by `product-svc` for now (aligned with the current `auth-svc` inventory/variant schemas).
- **Category slug resolution**: `/categories/:slug/products` expects `categories` to be present in the same Mongo database as `product-svc`.

## Admin API (write)

### POST `/admin/products`
Create a product.

**Request body**
```json
{
  "title": "Silk Saree",
  "slug": "silk-saree",
  "description": "Long form description",
  "shortDescription": "Short blurb",
  "primaryCategoryId": "<ObjectId>",
  "categoryIds": ["<ObjectId>", "<ObjectId>"],
  "tags": ["saree", "silk"],
  "currency": "INR",
  "images": [{ "url": "https://...", "alt": "...", "sortOrder": 1 }],
  "attributes": { "fabric": "Silk" },
  "isActive": true,
  "isFeatured": false,
  "sortOrder": 0,
  "seoTitle": "...",
  "seoDescription": "..."
}
```

**Response**: Product document.

---

### PUT `/admin/products/:id`
Update a product (partial updates allowed).

**Request body**
```json
{
  "title": "Updated name",
  "slug": "updated-name",
  "categoryIds": ["<ObjectId>"],
  "isActive": true
}
```

**Response**: Product document.

---

### POST `/admin/products/:id/variants`
Create a variant for a product.

**Request body**
```json
{
  "sku": "SR-RED-001",
  "optionValues": { "color": "Red", "size": "Free" },
  "price": 1999,
  "mrp": 2499,
  "compareAtPrice": 2499,
  "barcode": "",
  "weightKg": 0.4,
  "dimensionsCm": { "l": 10, "w": 10, "h": 2 },
  "images": [{ "url": "https://...", "alt": "...", "sortOrder": 1 }],
  "isDefault": true,
  "isActive": true,
  "inventory": {
    "trackInventory": true,
    "availableQty": 12,
    "reservedQty": 0,
    "allowBackorder": false,
    "reorderLevel": 3
  }
}
```

**Response**
```json
{
  "variant": { "_id": "...", "sku": "SR-RED-001", "price": 1999 },
  "inventory": { "_id": "...", "availableQty": 12, "allowBackorder": false }
}
```

## Storefront API (read)

### GET `/products`
List products with filters.

**Query params**
- `q`: full-text search (title/description/tags)
- `category` / `categoryId`: filter by category ObjectId
- `minPrice` / `maxPrice`: filter by variant price range
- `availability`: `in_stock` | `out_of_stock`
- `page`, `limit`

**Response**: Array of products with `minPrice`, `maxPrice`, and `availability` fields.

---

### GET `/products/:slug`
Fetch product detail by slug.

**Response**
```json
{
  "_id": "...",
  "title": "Silk Saree",
  "slug": "silk-saree",
  "variants": [
    {
      "_id": "...",
      "sku": "SR-RED-001",
      "price": 1999,
      "inventory": {
        "availableQty": 12,
        "allowBackorder": false
      },
      "availability": true
    }
  ],
  "priceRange": { "min": 1999, "max": 1999 },
  "availability": true
}
```

---

### GET `/categories/:slug/products`
Browse products by category slug.

**Response**: Same as `/products` list.

## Shared payloads

### Product
```json
{
  "_id": "...",
  "title": "...",
  "slug": "...",
  "description": "...",
  "shortDescription": "...",
  "primaryCategoryId": "<ObjectId>",
  "categoryIds": ["<ObjectId>"]
}
```

### Variant
```json
{
  "_id": "...",
  "productId": "<ObjectId>",
  "sku": "...",
  "optionValues": { "color": "Red" },
  "price": 1999,
  "mrp": 2499,
  "compareAtPrice": 2499
}
```

### Inventory availability
```json
{
  "sku": "...",
  "variantId": "<ObjectId>",
  "trackInventory": true,
  "availableQty": 12,
  "reservedQty": 0,
  "allowBackorder": false,
  "reorderLevel": 3
}
```
