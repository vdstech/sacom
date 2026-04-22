# Codebase Review Audit

## Summary
This document captures the repo-wide architecture review findings and whether each item was fixed in this pass or documented for follow-up.

## Critical Findings

### 1. Seeded admin credentials leaked into the login UI
- Current state:
  - `admin-portal/src/app/login/page.tsx` prefilled seeded admin email and password.
- Risk:
  - encourages unsafe local habits and leaks a seed password directly in the UI layer.
- Recommended fix:
  - clear default values and keep seed credentials only in explicit setup docs or seed code.
- Status in this pass:
  - Implemented.

### 2. Dead legacy auth inventory and variant modules remained in the repo
- Current state:
  - `auth-svc/src/inventory/*` and `auth-svc/src/variant/*` were not mounted from `auth-svc/src/server.js`.
- Risk:
  - misleading architecture, stale code paths, and higher maintenance cost.
- Recommended fix:
  - remove the unmounted modules after confirming they are unused.
- Status in this pass:
  - Implemented.

## High Findings

### 3. Duplicated Next-to-gateway proxy transport in both frontends
- Current state:
  - `admin-portal` and storefront had near-identical proxy transport implementations.
- Risk:
  - inconsistent behavior and duplicated bug surface around TLS, headers, and error handling.
- Recommended fix:
  - extract a shared transport helper.
- Status in this pass:
  - Implemented with `shared/next-gateway-proxy.ts`.

### 4. User-facing strings were scattered inline through storefront and admin UI
- Current state:
  - JSX files owned labels, empty states, and action text directly.
- Risk:
  - inconsistent copy, harder review, and difficult future localization/theming.
- Recommended fix:
  - centralize user-facing strings per app.
- Status in this pass:
  - Partially implemented.
  - Storefront now has `src/lib/strings.ts`.
  - Admin now has `src/lib/uiStrings.ts`.
  - Additional legacy pages can still be migrated later.

### 5. Shared shipping and return-policy defaults were duplicated between admin and product service
- Current state:
  - both apps carried the same long strings and external return-policy URL.
- Risk:
  - divergence and duplicated maintenance for product metadata defaults.
- Recommended fix:
  - extract shared defaults into a common module usable from both runtime environments.
- Status in this pass:
  - Implemented with `shared/product-metadata-defaults.js`.

### 6. Gateway and local dev TLS configuration still rely on insecure dev defaults
- Current state:
  - `gateway-svc` and `admin-portal` dev/start scripts still set `NODE_TLS_REJECT_UNAUTHORIZED=0`.
- Risk:
  - insecure defaults can bleed into environments beyond strict local development.
- Recommended fix:
  - move TLS/dev-policy into explicit config and reduce blanket disablement.
- Status in this pass:
  - Documented for follow-up.

## Medium Findings

### 7. Browser -> Next -> gateway -> service creates an extra hop in both UIs
- Current state:
  - both UIs proxy through Next before reaching the gateway.
- Risk:
  - added latency and duplicated route-handler surface.
- Recommended fix:
  - keep the hop where same-origin and cookie behavior justify it, but centralize transport and document ownership.
- Status in this pass:
  - Implemented in part.
  - Hop kept by design.
  - Duplicated transport removed.
  - Ownership documented.

### 8. Effective price is runtime-computed, not stored as a materialized field
- Current state:
  - variant discount metadata is persisted, but effective price is derived at read time.
- Risk:
  - drift if different consumers compute discounts differently.
- Recommended fix:
  - use shared read helpers consistently and document the model explicitly.
- Status in this pass:
  - Implemented in part.
  - Model documented.
  - Storefront price display and price-range filter already use shared effective-price semantics.

### 9. Price-range filter must stay aligned with effective-price semantics
- Current state:
  - category price-range UI is driven from product-service facet data.
- Risk:
  - mismatch if UI formatting or filter semantics drift from backend computation.
- Recommended fix:
  - document and verify category-wide effective-price bounds and shared price formatting.
- Status in this pass:
  - Implemented in part.
  - Documented and verified; no further code change was needed beyond shared formatting cleanup.

### 10. Category filter configuration is embedded in category documents
- Current state:
  - taxonomy and storefront filter definition live together.
- Risk:
  - tighter coupling between category management and storefront filtering schema.
- Recommended fix:
  - keep for now, but document as an architectural tradeoff and revisit if filter complexity grows.
- Status in this pass:
  - Documented for follow-up.

### 11. Duplicate stock concepts exist in product domain
- Current state:
  - stock is represented in variant rows and in the inventory collection.
- Risk:
  - competing sources of truth and reconciliation bugs.
- Recommended fix:
  - document the ownership problem and plan a future consolidation.
- Status in this pass:
  - Documented for follow-up.

### 12. Customer account data lives in auth-owned collections with storefront-shaped read models
- Current state:
  - wishlist and orders in `auth-svc` include storefront-facing snapshots.
- Risk:
  - auth service begins to absorb storefront read-model concerns.
- Recommended fix:
  - acceptable for the current footprint, but should be revisited if order logic or recommendation logic grows.
- Status in this pass:
  - Documented for follow-up.

### 13. Order history was not shaped for full audit-grade pricing snapshots
- Current state:
  - customer orders stored only `unitPrice` and `lineTotal`, which was enough for simple history reads but not enough for full discount traceability.
- Risk:
  - later catalog discount changes would make accounting and promotion analysis harder if order records rely on live discount definitions.
- Recommended fix:
  - persist immutable order-line and order-level pricing snapshots, and move checkout/order creation into a dedicated `order-svc`.
- Status in this pass:
  - Implemented in part.
  - The transitional order model/read contract now includes the future snapshot fields.
  - Dedicated checkout ownership remains a documented future service boundary.

## Low Findings

### 14. Backend service startup files are stylistically inconsistent
- Current state:
  - auth, catalog, and product service entry files duplicate CORS setup style and carry inconsistent comments.
- Risk:
  - readability and maintenance cost rather than immediate runtime breakage.
- Recommended fix:
  - standardize in a later server bootstrap cleanup pass.
- Status in this pass:
  - Documented for follow-up.

### 15. Some user-facing assets and URLs remain hardcoded in presentation layers
- Current state:
  - example: storefront hero background image URL remains in CSS.
- Risk:
  - low operational risk, but poor portability and difficult theme control.
- Recommended fix:
  - move presentation assets behind design tokens or real CMS/config later.
- Status in this pass:
  - Documented for follow-up.

## Review Notes by Requested Category

### Coding standards and consistency
- Frontends are stronger than backends on type safety and structure.
- No consistent lint/test baseline exists across backend services.

### Hardcoded secrets, seed credentials, and environment defaults
- Seed password leakage in the UI was fixed.
- Dev-only TLS bypass remains and is documented.
- Local service URLs still appear inline in gateway and some docs.

### Request-hop efficiency
- The hop count is acceptable for same-origin and cookie reasons.
- Duplicate proxy mechanics were removed.

### UI code quality
- Storefront strings and shared helpers improved readability.
- Admin still has page-local orchestration that could be extracted further.

### String sprawl
- Reduced substantially in reviewed storefront and admin surfaces.

### Runtime vs persisted discount behavior
- Discount metadata is stored.
- Effective price is computed at runtime.

### Price-range data flow
- Category-wide effective-price bounds are the current correct contract.

### Database design
- Ownership is service-separated, but product stock and customer read-model duplication remain notable tradeoffs.

### Naming clarity
- Improved in shared helpers and state naming already present in reviewed files.

### Comment and documentation gaps
- Key proxy and customer auth files now have targeted comments.
- Full architecture document set added in this pass.
