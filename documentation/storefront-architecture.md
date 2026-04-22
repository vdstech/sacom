# Storefront Architecture

## Purpose
`siri-frontend-simple-proxy-v2` is the customer storefront for category browsing, product detail, cart access, and customer account features.

## Bounded Responsibility
- category-driven navigation
- home merchandising
- live category listing pages
- PDP rendering and gallery interaction
- guest cart and customer account UI
- account auth, wishlist, orders, and saved addresses

## External Interfaces
- browser routes such as `/`, `/c/[...slug]`, `/products/[slug]`, `/account/*`
- same-origin proxy routes under `/api/proxy/*`

## Important Internal Modules
- `src/lib/storeApi.ts`
- `src/lib/accountApi.ts`
- `src/lib/storefront.ts`
- `src/lib/pricing.ts`
- `src/lib/constants.ts`
- `src/lib/strings.ts`
- `src/components/NavBar.tsx`
- `src/components/StoreProvider.tsx`
- `src/components/AccountProvider.tsx`
- `src/components/ProductCard.tsx`

## Navigation and Category Model
The storefront no longer uses a separate navigation service. It derives menu structure and category routing from the category tree returned by `catalog-svc`.

Live category behavior is explicit, not inferred from product existence.

## Fetch Path
- browser -> storefront Next route
- storefront Next route -> gateway
- gateway -> service

Server-side and browser-side fetches use the same policy:

- browser stays same-origin
- server components and route handlers know the gateway internal URL
- transport mechanics are centralized in `shared/next-gateway-proxy.ts`

## Pricing and Price Range
The storefront treats effective price as the customer-facing price everywhere:

- product cards
- PDP
- on-image discount badges
- category price slider

The price slider is rendered only on live category listing pages and uses category-wide bounds returned from `/products/facets`.

## UI Standards in This Pass
- user-facing storefront copy is centralized in `src/lib/strings.ts`
- shared storage keys moved into `src/lib/constants.ts`
- price formatting is shared in `src/lib/pricing.ts`

## Known Constraints and Debt
- Some visual assets still use hardcoded URLs in CSS
- The home page and PDP still do page-local orchestration for several async requests
- Storefront copy is centralized, but not every historical page has been moved yet

## Relationship to Other Services
- category tree from `catalog-svc`
- product reads and cart from `product-svc`
- customer account flows from `auth-svc`
- all service traffic enters through `gateway-svc`
