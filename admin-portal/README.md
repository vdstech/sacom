# admin-portal

Next.js admin UI for managing auth, category, product, variant, and inventory data.

## Run

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

Browser URL:
- `https://localhost:3000`

## How It Connects
- Browser calls same-origin Next routes on `https://localhost:3000/api/...`
- Next proxies those requests to gateway, usually `https://localhost:4000`
- TLS trust is handled by the local cert settings already baked into the dev/start scripts

Important envs:
- `GATEWAY_INTERNAL_URL`: upstream gateway used by the Next server
- `NEXT_PUBLIC_API_BASE_URL`: browser-visible base URL, usually `https://localhost:3000`

## Current Scope
- Admin auth and session refresh
- Roles and permissions
- Admin user management
- Category tree management
- Category filter configuration
- Product CRUD
- Variant CRUD
- Inventory reads and updates

## Storefront Relationship
- Storefront navigation is category-driven now
- The admin portal no longer manages a separate storefront navigation tree
- Category `sortOrder`, hierarchy, `slug`, and `path` drive storefront menu structure

## Notes
- Keep the gateway running; the admin app expects to proxy through it in normal local development
- Self-signed local cert support is expected in dev
