# Product Service API

## Ownership
- `products` collection: core product content + defaults (`materialProfile`, `careDefault`, `returnPolicyDefault`).
- `product_variants` collection: sellable choices and color/size source of truth (`merchandise`).
- `inventory` collection: stock + operational snapshot (`display`, `care`, `returnPolicy`, `fulfillment`).

## Color swatch contract
Color display is derived from active variants.

- `variant.merchandise.color.name` is required.
- `variant.merchandise.color.hex` is optional swatch color.
- `GET /products` and `GET /products/:slug` return:
  - `colorSummary.colorNames: string[]`
  - `colorSummary.swatches: [{ name, hex? }]`
  - `colorSummary.hasMultipleColors: boolean`

Swatch rules:
1. only active variants
2. dedupe by case-insensitive color name
3. order by default variant first, then `sortOrder`, then `createdAt`
4. first matching variant wins when same name has different hex

## Admin write APIs

### POST `/api/admin/products`
Create product with canonical defaults.

```json
{
  "title": "Silk Saree",
  "slug": "silk-saree",
  "primaryCategoryId": "<ObjectId>",
  "categoryIds": ["<ObjectId>"],
  "materialProfile": {
    "fabric": "Kanchipuram silk",
    "weave": "Handloom",
    "workType": "Zari",
    "pattern": "Traditional",
    "borderStyle": "Temple",
    "palluStyle": "Rich pallu"
  },
  "occasionTags": ["Wedding", "Festive"],
  "blouseDefault": {
    "included": true,
    "type": "Unstitched",
    "lengthMeters": 0.8
  },
  "careDefault": {
    "washCare": ["Dry clean only"],
    "ironCare": "Low heat reverse",
    "bleach": "Do not bleach",
    "dryClean": "Recommended",
    "dryInstructions": "Dry in shade"
  },
  "returnPolicyDefault": {
    "returnable": true,
    "windowDays": 7,
    "type": "exchange_or_refund",
    "notes": "Unused products only"
  }
}
```

### PUT `/api/admin/products/:id`
Update product. Same canonical fields as create.

### POST `/api/admin/products/:id/variants`
Create variant with canonical merchandise and optional initial inventory.

```json
{
  "sku": "SR-RED-001",
  "price": 1999,
  "mrp": 2499,
  "merchandise": {
    "color": { "name": "Red", "family": "Warm", "hex": "#C62828" },
    "size": { "label": "Free", "system": "IN", "sortKey": 0 },
    "blouse": { "included": true, "type": "Unstitched", "lengthMeters": 0.8 },
    "saree": {
      "lengthMeters": 5.5,
      "widthMeters": 1.2,
      "weightGrams": 700,
      "fallPicoDone": false,
      "stitchReady": false
    },
    "style": { "occasionTags": ["Wedding"], "workType": "Zari", "pattern": "Traditional" }
  },
  "inventory": {
    "trackInventory": true,
    "availableQty": 10,
    "reservedQty": 0,
    "allowBackorder": false,
    "reorderLevel": 2,
    "display": { "colorName": "Red", "sizeLabel": "Free", "materialLabel": "Silk" },
    "care": {
      "washCare": ["Dry clean only"],
      "ironCare": "Low",
      "bleach": "No",
      "dryClean": "Yes",
      "dryInstructions": "Shade"
    },
    "returnPolicy": {
      "returnable": true,
      "windowDays": 7,
      "type": "exchange_or_refund",
      "notes": "Unused"
    }
  }
}
```

### PATCH `/api/admin/products/:id/variants/:variantId`
Update variant. Supports canonical merchandise fields and optional `inventory` snapshot patch.

### PATCH `/api/admin/products/inventory/:id`
Update stock + operational snapshot (`display`, `care`, `returnPolicy`, `fulfillment`).

## Storefront read APIs

### GET `/products`
List products with `minPrice`, `maxPrice`, `availability`, and `colorSummary`.

### GET `/products/:slug`
Returns product + active variants + per-variant inventory + effective policies:
- `effectiveCare`: `inventory.care` -> `variant.merchandise.careOverride` -> `product.careDefault`
- `effectiveReturnPolicy`: `inventory.returnPolicy` -> `variant.merchandise.returnPolicyOverride` -> `product.returnPolicyDefault`

### GET `/categories/:slug/products`
Category-scope list with same product list payload shape.

## Validation rules
- `merchandise.color.name` required for variant create.
- `merchandise.color.hex` must be `#RGB` or `#RRGGBB` when provided.
- Numeric quantities/dimensions must be non-negative.
- Return policy consistency:
  - `returnable=false` -> `windowDays=0`, `type=none`
  - `returnable=true` -> `windowDays>=1`

## Additional admin APIs
- `GET /api/admin/products`
- `GET /api/admin/products/:id`
- `PATCH /api/admin/products/:id/publish`
- `DELETE /api/admin/products/:id`
- `GET /api/admin/products/:id/variants`
- `GET /api/admin/products/inventory/list`
