# Admin Portal Architecture

## Purpose
`admin-portal` is the operator-facing UI for category, product, inventory, user, role, and permission management.

## Bounded Responsibility
- admin login and bootstrap
- permission-gated navigation
- admin CRUD screens
- health and diagnostics screens

## External Interfaces
- same-origin Next routes which proxy to `gateway-svc`
- UI routes such as `/login`, `/profile`, `/admin/categories`, `/admin/products`, `/admin/inventory`

## Important Internal Modules
- `src/lib/server-proxy.ts`
- `src/lib/api.ts`
- `src/lib/auth.tsx`
- `src/lib/permissions.ts`
- `src/lib/uiStrings.ts`
- `src/components/AppShell.tsx`
- `src/components/Sidebar.tsx`

## Request and Data Flow
The browser talks to admin Next routes. Those routes proxy to the gateway, which then reaches the service layer. This keeps cookies and admin auth flows same-origin from the browser perspective.

## UI Standards in This Pass
- menu labels moved to a centralized strings module
- repeated confirm and prompt labels were extracted in reviewed pages
- seeded credentials were removed from the login form
- shared proxy transport now comes from `shared/next-gateway-proxy.ts`

## Storage Ownership
None. The admin portal is a UI only.

## Known Constraints and Debt
- Many admin pages still use page-local fetch orchestration instead of shared data hooks
- Dev scripts still rely on `NODE_TLS_REJECT_UNAUTHORIZED=0` for local backend TLS
- Some table formatting logic remains page-local and could be further extracted

## Relationship to Other Services
- depends on `gateway-svc` for all backend access
- administrates `auth-svc`, `catalog-svc`, and `product-svc`
