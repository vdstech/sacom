# admin-portal

Node.js-based Next.js admin GUI for auth, catalog, product, inventory, and navigation management.

## Run (HTTPS default)

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

Notes:
- Browser URL: `https://localhost:3000`
- Admin portal calls same-origin API (`https://localhost:3000/api/...`)
- Next server proxies to gateway (`https://localhost:4000`) via `GATEWAY_INTERNAL_URL`
- Dev/start scripts trust local cert via `NODE_EXTRA_CA_CERTS=../auth-svc/certs/localhost.crt`
- Dev/start scripts also set `NODE_TLS_REJECT_UNAUTHORIZED=0` for local self-signed cert compatibility

## Modes

- Gateway mode (default): `NEXT_PUBLIC_API_BASE_URL=https://localhost:3000` and `GATEWAY_INTERNAL_URL=https://localhost:4000`
- Direct mode: set service URLs with `NEXT_PUBLIC_*_URL`.
