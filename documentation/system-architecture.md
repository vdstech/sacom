# System Architecture

## Purpose
This repo implements a small commerce platform with:

- `auth-svc` for admin auth and storefront customer accounts
- `catalog-svc` for category tree ownership
- `product-svc` for products, variants, inventory, carts, and storefront product reads
- `order-svc` as the planned future owner of checkout and order lifecycle
- `gateway-svc` as the TLS edge and service proxy
- `admin-portal` as the admin UI
- `siri-frontend-simple-proxy-v2` as the customer storefront

## Topology
Local development runs all services behind HTTPS except the storefront Next app, which serves on `http://localhost:3001`.

- Admin browser -> `admin-portal` Next routes -> `gateway-svc` -> backend service
- Storefront browser -> storefront Next proxy routes -> `gateway-svc` -> backend service
- `gateway-svc` -> `auth-svc`, `catalog-svc`, `product-svc`
- All backend services -> MongoDB

## Request-Hop Design
The extra Next-layer hop in both UIs is intentional for:

- same-origin browser requests
- cookie forwarding without exposing service URLs directly to the browser
- shielding the browser from backend TLS and route topology changes

This pass keeps the hop model, but consolidates the duplicated Next-to-gateway transport into `shared/next-gateway-proxy.ts`.

## Auth and Session Split
Two auth domains coexist:

- Admin auth in `auth-svc`
  - admin users
  - roles and permissions
  - admin session refresh flow
- Customer auth in `auth-svc`
  - customers
  - customer sessions
  - addresses
  - wishlist
  - current transitional order reads

Customer auth is intentionally separate from admin auth. Storefront customers do not inherit admin roles or admin login routes.

## Catalog and Storefront Data Flow
Categories are the storefront navigation source of truth.

- `catalog-svc` owns the category tree and category filter configuration
- storefront loads `/api/categories/tree`
- category pages resolve from category `path`
- only configured live slugs fetch merchandise

Current live categories:

- `blouse`
- `mangalsutra`
- `printed-sarees`

Home merchandising remains blouse-led by design.

## Product and Pricing Flow
`product-svc` stores:

- product metadata
- variant prices
- variant discount metadata
- variant image and option data
- inventory rows

`order-svc` is the planned future owner for checkout, order creation, payment linkage, and immutable commercial snapshots.

Effective price is computed at runtime from stored base price plus stored discount metadata. The storefront uses this runtime price for:

- product cards
- PDP pricing
- discount badges
- category price-range filtering

## Storage Ownership
- `auth-svc`: admin users, roles, permissions, admin sessions, customers, customer sessions, customer addresses, customer wishlist, transitional customer order reads
- `catalog-svc`: categories
- `product-svc`: products, variants, inventory, carts
- `order-svc`: planned future owner of checkout and order lifecycle

## Current Constraints
- Browser -> Next -> gateway -> service is a four-stage path that trades latency for deployment simplicity and same-origin safety.
- Discount is not persisted as a final effective price field; it is computed at read time.
- Financially relevant sold-price snapshots must be persisted at order creation time rather than recomputed from live variant discounts later.
- Inventory is represented in both variant stock arrays and a dedicated inventory collection.
- Category filter configuration lives inside category documents, coupling taxonomy and storefront filtering rules.

## Local Dev Topology
This repo uses local TLS for the backend and admin UI to mirror production cookie and proxy behavior more closely. The storefront remains plain HTTP during local development for convenience.
