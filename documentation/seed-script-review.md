# Seed And Legacy Script Review

## Scope

This review covers seed scripts, initialization scripts, seeded roles, seeded users, and legacy/backward-support scripts in the current first-version codebase.

## Backward-Support And Legacy Scripts

| File path | Purpose | Required for fresh first-version install | Referenced by package scripts / startup / CI / docs | Modifies production data | Recommendation |
| --- | --- | --- | --- | --- | --- |
| `auth-svc/src/seed/fix_duplicate_skus.js` | One-off repair script for duplicate SKU cleanup across `product_variants` and `inventory`, with optional dry-run behavior. | No. A clean install should not need duplicate-SKU repair. | No references found in package scripts, startup, CI, or docs. | Yes. Can rename variant SKUs, update inventory rows, and delete duplicate inventory rows when `DRY_RUN=false`. | Remove. |
| `auth-svc/src/seed/reset_catalog.js` | Destructive cleanup script that deletes all `products`, `product_variants`, and `inventory` documents from MongoDB. | No. A clean install should not need catalog deletion. | No references found in package scripts, startup, CI, or docs. | Yes. Deletes all documents in the target collections. | Remove. |

## Seed And Initialization Scripts

| File path | How it runs | Manual or automatic | Writes to | Idempotent | Creates or updates | Deletes anything | Safe to rerun | Environment/config dependencies |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `auth-svc/src/seed/seed.js` | `npm run seed` in `auth-svc` | Manual | Delegates to permission, role, and user seed modules | Yes, as an orchestrator | Both, through imported modules | No | Yes | `MONGO_URI` |
| `auth-svc/src/seed/seedCategoryPermissions.js` | Imported by `seed.js` | Automatic when `npm run seed` is run | `backend_permissions`; may also append permissions to seeded admin roles if they already exist | Yes, via permission upserts keyed by `code` | Creates missing permissions and updates descriptions/children on existing ones | No | Yes | Active MongoDB connection |
| `auth-svc/src/seed/seedRolesUsers.js` | Imported by `seed.js` | Automatic when `npm run seed` is run | `backend_roles`, `backend_users` | Mostly yes | Upserts roles by `name`, creates the super admin if missing, and updates the seeded super admin on rerun | No | Yes, but rerun resets the seeded super admin password to the current seed value | Active MongoDB connection, `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD` |
| `auth-svc/src/seed/seedRolesUsers.test.js` | `node --test auth-svc/src/seed/seedRolesUsers.test.js` | Manual test only | None | N/A | None | No | Yes | Node test runner |

## Seeded Roles

The clean first-version seed creates the following roles.

| Role code/name | Display/purpose summary | System role | Permissions | Main UI pages/actions | Still required | Overlap / notes | Category |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPER_ADMIN` | Full system super administrator | Yes | All active seeded permissions | All admin portal areas via system-level bypass | Yes | Top-level system role | System/admin |
| `ADMIN` | Full system administrator | Yes | All active seeded permissions | All admin portal areas via system-level bypass | Yes | Broader than task-specific roles by design | System/admin |
| `ORDER_ADMIN` | Order oversight and pre-shipment cancellation admin | No | `order:read`, `order:admin`, `order:dashboard:fulfillment:read`, `order:dashboard:escalations:read` | `/admin/orders/dashboard`, `/admin/orders/metrics`, `/admin/orders`; oversight tabs and order-admin actions | Yes | Focused oversight role | Order/fulfillment, dashboard/reporting |
| `PROCESSING_MANAGER` | Picks reserved items and hands them to packaging | No | `order:read`, `order:processing` | `/admin/orders/dashboard`, `/admin/orders/processing`, `/admin/orders`; processing queue actions | Yes | Purpose-built lane role | Order/fulfillment, processing manager |
| `PACKAGING_MANAGER` | Receives, packs, labels, and hands items to shipping | No | `order:read`, `order:packaging` | `/admin/orders/packaging`; packaging queue actions | Yes | Purpose-built lane role | Order/fulfillment, packaging manager |
| `SHIPPING_OPERATOR` | Receives packed items, assigns shipment details, and ships them | No | `order:read`, `order:shipping` | `/admin/orders/shipping`; shipping queue actions | Yes | Purpose-built lane role | Order/fulfillment, shipping operator |
| `CANCELLATION_MANAGER` | Receives cancellation handovers and resolves stock outcome | No | `order:read`, `order:cancellation` | `/admin/orders/cancellations`; cancellation receipt and disposition actions | Yes | Purpose-built lane role | Order/fulfillment |
| `RETURN_EXCHANGE_HANDLER` | Investigates and updates return/exchange cases | No | `order:read`, `order:return` | `/admin/orders/returns-exchanges`; return/exchange lifecycle actions | Yes | Separate post-order case role | Order/fulfillment |
| `INVENTORY_MANAGER` | Reviews and updates stock positions | No | `order:read`, `inventory:read`, `product:inventory:update` | `/admin/inventory`; inventory read/update actions | Yes | Crosses order visibility with inventory management | Inventory |

Removed legacy overlap:

| Role code/name | Reason removed |
| --- | --- |
| `ORDER_OPERATIONS` | Legacy overlap role that bundled multiple order lanes into one seeded role. It is no longer needed for a clean first-version install because the live permission model already uses explicit lane permissions and dedicated lane roles. |

## Seeded User

The clean first-version seed creates one admin user.

| Email/login | Display name | Roles assigned | System user | Enabled | Password handling | Purpose | Required for operation | Demo/test-only | Safe to delete in UI | Delete guard |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPER_ADMIN_EMAIL` env value, defaulting to `superadmin@sa.com` if unset | `Super Admin` | `SUPER_ADMIN` | Yes | Yes | A seeded/default password exists from `SUPER_ADMIN_PASSWORD` or the built-in fallback; reseeding resets the password to the current seed value | Bootstrap admin access for first login and RBAC management | Required for first-time admin access unless another admin is created through a controlled setup path | No | No | Yes, API deletion is blocked for `isSystemUser` |

Notes:
- No other installation-time users are seeded.
- The seeded super admin is marked `isSystemUser: true`.
- The user is created with `force_reset: false`.

## Overall Seed Behavior

- Creates or updates the full permission set listed in `auth-svc/src/seed/seedCategoryPermissions.js`.
- Creates or updates the role records listed above in `auth-svc/src/seed/seedRolesUsers.js`.
- Creates the first super admin user if missing.
- On reseed, ensures the super admin keeps the `SUPER_ADMIN` role, remains enabled, remains a system user, and has the seeded password reset to the current configured seed value.
- Does not seed products, categories, variants, inventory rows, orders, dashboard demo data, or customer accounts.
- Does not delete records as part of the normal install seed flow.
- Does not branch behavior by environment; behavior depends only on seed-related environment values and current database contents.
- Startup can succeed without seeding, but admin login, RBAC, and protected admin workflows are not properly bootstrapped until the auth seed runs.

## Cleanup Implemented

- Removed `auth-svc/src/seed/fix_duplicate_skus.js`.
- Removed `auth-svc/src/seed/reset_catalog.js`.
- Removed the legacy `ORDER_OPERATIONS` role from the clean-install seed path.
- Updated `RUNNING.md` to document the required auth seed step and to avoid printing a default password in the setup guide.

## Clean First-Version Installation

1. Copy the service env files as documented in `RUNNING.md`.
2. Set `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD` in `auth-svc/.env`.
3. Install dependencies in `auth-svc`.
4. Run `npm run seed` in `auth-svc`.
5. Start the services and log in with the configured super admin credentials.

## Validation Notes

- `npm run seed` is the only package-managed installation seed entry point.
- No package script, startup path, CI path, or documentation reference depends on the removed legacy scripts.
