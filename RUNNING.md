# Run Guide

## Runtime Modes
- Default production-style service mode is plain HTTP behind an external proxy/load balancer.
- Local certificate-based TLS is still supported, but it is now opt-in through `ENABLE_TLS=true`.
- Gateway upstream TLS bypass is local-dev-only and opt-in through `ALLOW_INSECURE_UPSTREAM_TLS=true`.

## Services
- `auth-svc`: auth/admin service on `http://localhost:4443` by default, or `https://localhost:4443` when TLS is enabled
- `catalog-svc`: category/catalog service on `http://localhost:4444` by default, or `https://localhost:4444` when TLS is enabled
- `product-svc`: product and cart service on `http://localhost:4445` by default, or `https://localhost:4445` when TLS is enabled
- `gateway-svc`: API gateway on `http://localhost:4000` by default, or `https://localhost:4000` when TLS is enabled
- `admin-portal`: Next.js admin UI on `http://localhost:3000` in production-style mode or `https://localhost:3000` in local TLS dev mode
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

Before seeding auth data, set `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD` in `auth-svc/.env`.

Core runtime flags used by the hardened v1 stack:

```text
ENABLE_TLS=false
ALLOW_INSECURE_UPSTREAM_TLS=false
CORS_ORIGINS=http://localhost:3000,https://localhost:3000,http://localhost:3001,https://localhost:3001
DEFAULT_PRODUCT_TAX_RATE=0.05
STANDARD_SHIPPING_CHARGE=50
FREE_SHIPPING_CART_VALUE=999
PRICING_RULE_VERSION=2
```

For local certificate-based development:

```text
ENABLE_TLS=true
ALLOW_INSECURE_UPSTREAM_TLS=false
```

Only if you are using locally trusted/self-signed upstream certificates that Node will not trust, set `ALLOW_INSECURE_UPSTREAM_TLS=true` in `gateway-svc/.env`.

Seed roles, permissions, and the initial super admin user:

```bash
cd /Users/kamattap/spaces/sacom/auth-svc && npm install && npm run seed
```

## Start the Stack
Run each service in its own terminal for plain HTTP local startup:

```bash
cd /Users/kamattap/spaces/sacom/auth-svc && npm install && npm run dev
cd /Users/kamattap/spaces/sacom/catalog-svc && npm install && npm run dev
cd /Users/kamattap/spaces/sacom/product-svc && npm install && npm run dev
cd /Users/kamattap/spaces/sacom/gateway-svc && npm install && npm run dev
cd /Users/kamattap/spaces/sacom/admin-portal && npm install && GATEWAY_INTERNAL_URL=http://localhost:4000 npm run dev
cd /Users/kamattap/spaces/sacom/siri-frontend-simple-proxy-v2 && npm install && npm run dev
```

If you want local TLS service startup, set `ENABLE_TLS=true` in each backend `.env`, keep the cert paths valid, and use:

```bash
cd /Users/kamattap/spaces/sacom/gateway-svc && ALLOW_INSECURE_UPSTREAM_TLS=true npm run dev:insecure-upstream
cd /Users/kamattap/spaces/sacom/admin-portal && GATEWAY_INTERNAL_URL=https://localhost:4000 npm run dev
```

Production-style frontend startup:

```bash
cd /Users/kamattap/spaces/sacom/admin-portal && npm run build && npm run start
cd /Users/kamattap/spaces/sacom/siri-frontend-simple-proxy-v2 && npm run build && npm run start
```

## Docker Compose
Production-style compose startup is available through [docker-compose.deploy.yml](/Users/kamattap/spaces/sacom/docker-compose.deploy.yml). It runs the stack over internal HTTP and expects external TLS termination if you need HTTPS.

```bash
docker compose -f /Users/kamattap/spaces/sacom/docker-compose.deploy.yml up --build
```

Seed the auth service after the stack is up:

```bash
docker compose -f /Users/kamattap/spaces/sacom/docker-compose.deploy.yml exec auth-svc npm run seed
```

## Smoke Checks
Backend health:

```bash
curl http://localhost:4443/health
curl http://localhost:4444/health
curl http://localhost:4445/health
curl http://localhost:4000/health
```

HTTPS hop check:

```bash
node /Users/kamattap/spaces/sacom/scripts/check-https-hops.mjs
```

## URLs
- Admin login: `http://localhost:3000/login`
- Storefront: `http://localhost:3001`

## Current Frontend Behavior
### Admin portal
- Uses same-origin API routes on `http://localhost:3000/api/...`
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
- If a service fails on startup with TLS enabled, verify `ENABLE_TLS=true` only where cert files are actually mounted and readable.
- If the storefront menu is empty, confirm categories exist and are active in catalog; storefront no longer reads a separate navigation service.
