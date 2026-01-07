# siri-frontend-simple-proxy-v2

Single page app:
- Menu renders from backend navigation API (NO local nav)
- Browser calls `/api/navigation` (same-origin, no CORS)
- Next server fetches `${BACKEND_URL}/api/store/navigation`

## Run
```bash
npm install
cp .env.local.example .env.local
npm run dev
```
