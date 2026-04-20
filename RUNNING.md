# Run Guide

## Services
- `auth-svc`: HTTPS auth/admin service on `https://localhost:4443`
- `catalog-svc`: HTTPS category/catalog service on `https://localhost:4444`
- `product-svc`: HTTPS product and cart service on `https://localhost:4445`
- `gateway-svc`: HTTPS API gateway on `https://localhost:4000`
- `admin-portal`: Next.js admin UI on `https://localhost:3000`
- `siri-frontend-simple-proxy-v2`: Next.js storefront on `http://localhost:3001`

## First-Time Setup
Copy env files once:

```bash
cd /Users/kamattap/spaces/sacom/auth-svc && cp .env.example .env
cd /Users/kamattap/spaces/sacom/catalog-svc && cp .env.example .env
cd /Users/kamattap/spaces/sacom/product-svc && cp .env.example .env
cd /Users/kamattap/spaces/sacom/gateway-svc && cp .env.example .env
cd /Users/kamattap/spaces/sacom/admin-portal && cp .env.local.example .env.local
cd /Users/kamattap/spaces/sacom/siri-frontend-simple-proxy-v2 && cp .env.local.example .env.local
```

Shared JWT secret must match in `auth-svc`, `catalog-svc`, and `product-svc`:

```text
ACCESS_TOKEN_SECRET=change_me
```

Quick config check:

```bash
node /Users/kamattap/spaces/sacom/scripts/check-auth-config.mjs
```

## Start the Stack
Run each service in its own terminal:

```bash
cd /Users/kamattap/spaces/sacom/auth-svc && npm install && npm run dev
cd /Users/kamattap/spaces/sacom/catalog-svc && npm install && npm run dev
cd /Users/kamattap/spaces/sacom/product-svc && npm install && npm run dev
cd /Users/kamattap/spaces/sacom/gateway-svc && npm install && npm run dev
cd /Users/kamattap/spaces/sacom/admin-portal && npm install && npm run dev
cd /Users/kamattap/spaces/sacom/siri-frontend-simple-proxy-v2 && npm install && npm run dev
```

## Smoke Checks
Backend health:

```bash
curl -k https://localhost:4443/health
curl -k https://localhost:4444/health
curl -k https://localhost:4445/health
curl -k https://localhost:4000/health
```

HTTPS hop check:

```bash
node /Users/kamattap/spaces/sacom/scripts/check-https-hops.mjs
```

## URLs
- Admin login: `https://localhost:3000/login`
- Storefront: `http://localhost:3001`

Default admin credentials:
- email: `superadmin@sa.com`
- password: `SuperAdmin@123`

## Current Frontend Behavior
### Admin portal
- Uses same-origin API routes on `https://localhost:3000/api/...`
- Proxies to gateway through `GATEWAY_INTERNAL_URL`
- Manages roles, admin users, categories, products, variants, and inventory
- Category tree is the source of storefront navigation structure

### Storefront
- Uses `http://localhost:3001/api/proxy/...` in the browser
- Proxy forwards to gateway, which forwards to auth/catalog/product services
- Navigation is category-driven from `GET /api/categories/tree`
- Live merchandise categories are currently `blouse` and `mangalsutra`
- Home merchandising stays pinned to `blouse`
- Guest cart works without login
- Customer account supports login/signup, orders, wishlist, and saved addresses

## Useful Verification
Storefront typecheck:

```bash
cd /Users/kamattap/spaces/sacom/siri-frontend-simple-proxy-v2 && ./node_modules/.bin/tsc --noEmit
```

Admin typecheck:

```bash
cd /Users/kamattap/spaces/sacom/admin-portal && ./node_modules/.bin/tsc --noEmit
```

Product DTO tests:

```bash
cd /Users/kamattap/spaces/sacom/product-svc && node --test src/product/response.dto.test.js src/product/defaultMetadata.test.js
```

## Troubleshooting
- If auth/config writes fail with `Server misconfigured`, re-run `check-auth-config.mjs` and fix secret parity.
- If local TLS hops fail, run `check-https-hops.mjs` and inspect the failing endpoint.
- If the storefront menu is empty, confirm categories exist and are active in catalog; storefront no longer reads a separate navigation service.
