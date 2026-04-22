# Order Service Architecture

## Purpose
`order-svc` is the planned future owner of checkout, immutable pricing snapshots, order creation, payment linkage, and fulfillment-facing order lifecycle.

## Bounded Responsibility
- checkout session creation
- order draft and order creation
- pricing snapshot generation
- coupon and promotion application
- payment reference capture
- fulfillment-facing order status transitions
- customer order reads

It should not own customer identity, category taxonomy, or live catalog inventory.

## Intended Ownership Split
- `auth-svc`
  - customers
  - customer sessions
  - addresses
  - wishlist
- `product-svc`
  - products
  - variants
  - inventory
  - cart
- `order-svc`
  - checkout
  - order pricing snapshots
  - orders
  - payment and fulfillment state

## Pricing Snapshot Model
Order creation must persist immutable commercial snapshots. Runtime discount recomputation is acceptable for storefront browsing, but not for audit or accounting.

Each order line should snapshot:
- product and variant identity
- customer-visible title, slug, and image
- list unit price
- catalog discount type/value/label/amount
- promo discount type/value/label/amount
- final unit price
- subtotal, tax, shipping, discount, and grand total
- currency

Each order should snapshot:
- customer ID
- address snapshot
- pricing version
- coupon code
- subtotal, discount total, shipping total, tax total, grand total
- payment reference
- payment status
- fulfillment status

## Checkout Flow
1. Storefront reads cart from `product-svc`.
2. Checkout calls `order-svc`.
3. `order-svc` validates live catalog prices and availability through a pricing module.
4. `order-svc` applies catalog and promotional pricing rules.
5. `order-svc` freezes the result into an order snapshot.
6. Later catalog changes never alter historical order values.

## Transitional State in Current Repo
Current customer order reads still live in `auth-svc`. That storage should be treated as transitional. The order document shape in the repo has been expanded to match the future snapshot contract so migration to `order-svc` does not require another storefront order-API shape change.

## Future Interfaces
- `POST /api/customer/checkout/session`
- `POST /api/customer/orders`
- `GET /api/customer/orders`
- `GET /api/customer/orders/:id`

## Known Constraints
- There is no real checkout write flow in the current branch.
- Payment orchestration is not implemented yet.
- Shipping and tax calculation rules are still placeholders for the future pricing engine.
