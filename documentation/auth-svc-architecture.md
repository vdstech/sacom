# Auth Service Architecture

## Purpose
`auth-svc` owns identity and session concerns for both admin operators and storefront customers.

## Bounded Responsibility
- admin login, logout, refresh, and session inspection
- admin users, roles, and permissions
- storefront customer signup, login, refresh, logout
- customer profile reads
- customer addresses
- customer wishlist
- transitional customer order history

It should not own product or inventory CRUD.

## External Interfaces
- `/auth/*` for admin auth
- `/api/admin/users`
- `/api/admin/roles`
- `/api/admin/permissions`
- `/api/customer/me`
- `/api/customer/addresses`
- `/api/customer/wishlist`
- `/api/customer/orders`
- `/auth/customer/*`
- `/auth/session/*`

## Important Internal Modules
- `src/auth/*` for admin auth
- `src/customer/*` for customer auth and account features
- `src/middleware/requireAuth.js` for admin protection
- `src/middleware/requireCustomerAuth.js` for customer protection

## Request and Data Flow
Admin requests arrive through the gateway and rely on admin JWT plus refresh flow. Storefront customer requests also arrive through the gateway, but use a separate customer refresh cookie and customer session records.

`requireCustomerAuth` verifies:

1. bearer token signature
2. customer session existence
3. customer record existence and enabled state

This prevents stale customer access tokens from remaining valid after the backing session disappears.

## Storage Ownership
- admin users
- roles
- permissions
- admin sessions
- customers
- customer sessions
- customer addresses
- customer wishlist
- transitional customer orders

## Known Constraints and Debt
- Customer wishlist and orders currently embed storefront-oriented read-model snapshots inside auth-owned storage.
- Checkout should move to a dedicated `order-svc`; `auth-svc` should retain only identity and account-owned data once that migration happens.
- Admin and customer session flows are intentionally separate, but their implementation patterns are similar and could be standardized later.
- The old auth-local inventory and variant modules were dead legacy code and were removed in this pass.

## Relationship to Other Services
- relies on `gateway-svc` for public routing
- does not own category data
- does not own product/variant/inventory canonical data
