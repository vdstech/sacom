# siri-frontend-simple-proxy-v2

Next.js customer storefront.

## Run

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

Browser URL:
- `http://localhost:3001`

## Request Flow
- Browser requests go through the local Next proxy at `/api/proxy/...`
- The Next server forwards to gateway, defaulting to `https://localhost:4000`
- Server-side fetches also use `GATEWAY_INTERNAL_URL`

## Current Storefront Behavior
- Header navigation comes from `GET /api/categories/tree`
- Category tree is the only source of visible storefront categories
- Live catalog categories are currently `blouse` and `mangalsutra`
- Home merchandising remains pinned to `blouse`
- Non-live categories stay visible and render coming-soon pages without product/facet fetches

## Customer Features
- Guest cart
- Customer login/signup
- Header account panel
- Orders
- Wishlist
- Saved addresses

## Notes
- Admin portal uses `https://localhost:3000`
- This storefront intentionally uses `3001` to avoid port conflict with admin
- If local proxy calls fail, verify that gateway and the three backend services are running
