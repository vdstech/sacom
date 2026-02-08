# HTTPS Run Guide

## 1. Setup (copy env once)
```bash
cd /Users/kamattap/spaces/sacom/auth-svc && cp .env.example .env
cd /Users/kamattap/spaces/sacom/catalog-svc && cp .env.example .env
cd /Users/kamattap/spaces/sacom/product-svc && cp .env.example .env
cd /Users/kamattap/spaces/sacom/navigation-svc && cp .env.example .env
cd /Users/kamattap/spaces/sacom/gateway-svc && cp .env.example .env
cd /Users/kamattap/spaces/sacom/admin-portal && cp .env.local.example .env.local
```

Shared JWT secret (must match in all services):
`ACCESS_TOKEN_SECRET=change_me`

Config sanity check:
```bash
node /Users/kamattap/spaces/sacom/scripts/check-auth-config.mjs
```

## 2. Start 6 terminals
Terminal 1:
```bash
cd /Users/kamattap/spaces/sacom/auth-svc && npm install && npm run dev
```

Terminal 2:
```bash
cd /Users/kamattap/spaces/sacom/catalog-svc && npm install && npm run dev
```

Terminal 3:
```bash
cd /Users/kamattap/spaces/sacom/product-svc && npm install && npm run dev
```

Terminal 4:
```bash
cd /Users/kamattap/spaces/sacom/navigation-svc && npm install && npm run dev
```

Terminal 5:
```bash
cd /Users/kamattap/spaces/sacom/gateway-svc && npm install && npm run dev
```

Terminal 6:
```bash
cd /Users/kamattap/spaces/sacom/admin-portal && npm install && npm run dev
```

## 3. Smoke test
```bash
curl -k https://localhost:4443/health
curl -k https://localhost:4444/health
curl -k https://localhost:4445/health
curl -k https://localhost:4446/health
curl -k https://localhost:4000/health
```

Login URL:
`https://localhost:3000/login`

Credentials:
- email: `superadmin@sa.com`
- password: `SuperAdmin@123`

If cert error appears, run `node /Users/kamattap/spaces/sacom/scripts/check-https-hops.mjs` and paste output.
If `"Server misconfigured"` appears while creating categories/products/navigation, run `node /Users/kamattap/spaces/sacom/scripts/check-auth-config.mjs` and fix secret parity.
Category create, view, and edit now support expandable hierarchy UI; edit slug is auto-generated and editable.
Product/variant/inventory now use canonical merchandise modeling. Add color on variant (`merchandise.color`) so product swatches render from active variants in UI.
