# Gateway Service Architecture

## Purpose
`gateway-svc` is the public backend edge in local development. It terminates TLS and proxies route prefixes to the appropriate service.

## Bounded Responsibility
- TLS edge for backend APIs
- path-based proxying to auth, catalog, and product services
- coarse CORS handling
- health endpoint

It should not own business logic.

## External Interfaces
- `/auth`
- `/api`
- `/api/categories`
- `/api/admin/products`
- `/products`
- `/cart`
- `/health`

## Important Internal Modules
- `src/server.js`
- `src/tls.js`

## Request and Data Flow
- Next frontends call the gateway through their own same-origin proxy routes
- gateway selects the backend target by mount path
- services remain individually deployable and testable

## Known Constraints and Debt
- Local service URLs and local UI origins are still defined inline in `src/server.js`
- local dev currently forces insecure upstream TLS if `NODE_TLS_REJECT_UNAUTHORIZED` is not already set
- the gateway is intentionally thin, but its config should move into a dedicated config module in a follow-up pass

## Relationship to Other Services
- routes traffic to `auth-svc`, `catalog-svc`, and `product-svc`
- is used by both Next.js frontends as the only backend base
