
# Audit Logging Review

## Pre-change findings

- Audit logging existed only for `auth-svc` order workflows.
- Existing storage was MongoDB collection `order_audit_logs` via [auth-svc/src/customer-orders/customer-orders.audit-log.model.js](/Users/kamattap/spaces/sacom/auth-svc/src/customer-orders/customer-orders.audit-log.model.js:1).
- Existing audit writes were manual service-layer calls inside [auth-svc/src/customer-orders/customer-orders.service.js](/Users/kamattap/spaces/sacom/auth-svc/src/customer-orders/customer-orders.service.js:469) and [auth-svc/src/customer-orders/customer-orders.checkout.service.js](/Users/kamattap/spaces/sacom/auth-svc/src/customer-orders/customer-orders.checkout.service.js:88).
- Existing admin UI was only a placeholder at [admin-portal/src/app/admin/audit/page.tsx](/Users/kamattap/spaces/sacom/admin-portal/src/app/admin/audit/page.tsx:1).
- No audit retention policy existed for `order_audit_logs`.
- No audit read API existed.
- No common product-wide audit helper existed.
- Frontend actions were not the source of truth; only backend order service writes were audited.

### Pre-change order actions already audited

- `ORDER_CREATED`
- `EXCHANGE_COUPON_CONSUMED`
- `CUSTOMER_CANCEL_REQUESTED`
- `ADMIN_CANCEL_REQUESTED`
- `CANCEL_BEFORE_PICKING`
- `CUSTOMER_RETURN_REQUESTED`
- `CUSTOMER_EXCHANGE_REQUESTED`
- `RETURN_EXCHANGE_START_INVESTIGATION`
- `RETURN_EXCHANGE_ACCEPTED`
- `RETURN_EXCHANGE_REJECTED`
- `RETURN_EXCHANGE_TRACKING_UPDATED`
- `RETURN_EXCHANGE_RECEIVED`
- `RETURN_EXCHANGE_PLACEHOLDER_CREATED`
- `EXCHANGE_COUPON_GENERATED`
- `PICK_FROM_WAREHOUSE`
- `HANDOVER_TO_PACKAGING`
- `PACKAGING_CONFIRM_RECEIPT`
- `PACKAGING_REJECT_RECEIPT`
- `START_PACKAGING`
- `VERIFY_PACKAGE`
- `PRINT_LABEL`
- `REPRINT_LABEL`
- `MARK_PACKED`
- `HANDOVER_TO_SHIPPING`
- `SHIPPING_CONFIRM_RECEIPT`
- `SHIPPING_REJECT_RECEIPT`
- `START_SHIPPING`
- `ASSIGN_COURIER`
- `ENTER_TRACKING_NUMBER`
- `MARK_SHIPPED`
- `MARK_DELIVERED`
- `HANDOVER_TO_CANCELLATION`
- `CONFIRM_CANCELLATION_RECEIPT`
- `RESTOCK_CANCELLED_ITEM`
- `MARK_CANCELLED_ITEM_DAMAGED`
- `MARK_CANCELLED_ITEM_LOST`

## Pre-change storage

### Legacy order audit storage

- Database: MongoDB
- Collection: `order_audit_logs`
- Schema fields:
  - `userId`
  - `role`
  - `action`
  - `oldStatus`
  - `newStatus`
  - `referenceId`
  - `orderId`
  - `orderItemId`
  - `remarks`
  - `metadata`
  - `createdAt`
  - `updatedAt`
- Indexed fields:
  - `referenceId`
  - `orderId`
  - `orderItemId`
- Missing fields:
  - actor email/name
  - request id
  - IP address
  - user agent
  - generic entity type/id
  - result success/failure
  - failure reason
  - centralized query API
  - retention

### Application logs

- All services also write normal request/application logs through `pino-http`, but those were not an audit system and were not structured for audit retrieval or retention by business event.

## Pre-change retention

- `order_audit_logs`: no retention setting, no TTL index, no cleanup job, no archive, no delete policy.
- Normal app logs: standard runtime/container stdout behavior only; no audit-specific rotation configuration in this repo.

## Pre-change coverage matrix

| Area | Action | Currently Audited? | Storage | Actor Captured? | Old/New Values? | Success/Failure? | Gaps |
|---|---|---|---|---|---|---|---|
| Auth | Login success | No | None | No | N/A | No | No auth audit |
| Auth | Login failure | No | None | Partial email only in runtime logs at best | N/A | No | No auth audit |
| Auth | Logout | No | None | No | N/A | No | No auth audit |
| Auth | Password change/reset | No feature | None | No | N/A | No | No password change/reset flow exists |
| Users | User created | No | None | No | No | No | No user audit |
| Users | User updated | No | None | No | No | No | No user audit |
| Users | User deleted/disabled/enabled | No | None | No | No | No | No user lifecycle audit |
| Roles | Role created/updated/deleted | No | None | No | No | No | No role audit |
| Roles | Permission assigned/removed | No | None | No | No | No | No role permission audit |
| Products | Product created/updated/deleted | No | None | No | No | No | No product audit |
| Categories | Category created/updated/deleted | No | None | No | No | No | No category audit |
| Variants | Variant created/updated/deleted | Partial | None | No | No | No | No variant audit; delete route missing |
| Inventory | Quantity changed | No | None | No | No | No | No inventory audit |
| Orders | Status/lane transition | Yes | `order_audit_logs` | User id and role only | Usually status only | No | No request metadata or result |
| Processing | Pick item | Yes | `order_audit_logs` | User id and role only | Status only | No | Legacy shape only |
| Processing | Handover to packaging | Yes | `order_audit_logs` | User id and role only | Status only | No | Legacy shape only |
| Packaging | Confirm/reject receipt | Yes | `order_audit_logs` | User id and role only | Status only | No | Legacy shape only |
| Packaging | Start/package item | Yes | `order_audit_logs` | User id and role only | Status only | No | Legacy shape only |
| Packaging | Verify package | Yes | `order_audit_logs` | User id and role only | Status only | No | Legacy shape only |
| Packaging | Print/reprint/view label | Print/reprint only | `order_audit_logs` | User id and role only | Partial | No | View label not audited |
| Packaging | Mark packed | Yes | `order_audit_logs` | User id and role only | Status only | No | Legacy shape only |
| Packaging | Handover to shipping | Yes | `order_audit_logs` | User id and role only | Status only | No | Legacy shape only |
| Shipping | Confirm/reject receipt | Yes | `order_audit_logs` | User id and role only | Status only | No | Legacy shape only |
| Shipping | Ship item | Yes | `order_audit_logs` | User id and role only | Status only | No | Legacy shape only |
| Shipping | Courier/tracking update | Yes | `order_audit_logs` | User id and role only | Partial | No | Legacy shape only |
| Shipping | Mark shipped/completed | Shipped yes, completed/delivered yes | `order_audit_logs` | User id and role only | Status only | No | Legacy shape only |
| Cancellation | Cancellation requested/handled | Yes | `order_audit_logs` | User id and role only | Status only | No | Legacy shape only |
| Configuration | Important config changes | No | None | No | No | No | Permission catalog and role config changes not audited |

## Implemented design

- New centralized MongoDB collection: `audit_logs`
- New centralized auth audit model/service:
  - [auth-svc/src/audit/audit-log.model.js](/Users/kamattap/spaces/sacom/auth-svc/src/audit/audit-log.model.js:1)
  - [auth-svc/src/audit/audit.service.js](/Users/kamattap/spaces/sacom/auth-svc/src/audit/audit.service.js:1)
- Matching write helpers added to:
  - [product-svc/src/audit/audit.service.js](/Users/kamattap/spaces/sacom/product-svc/src/audit/audit.service.js:1)
  - [catalog-svc/src/audit/audit.service.js](/Users/kamattap/spaces/sacom/catalog-svc/src/audit/audit.service.js:1)
- Request metadata capture added through:
  - [shared/request-context.js](/Users/kamattap/spaces/sacom/shared/request-context.js:1)
- Sensitive data redaction and retention helpers added through:
  - [shared/audit-utils.js](/Users/kamattap/spaces/sacom/shared/audit-utils.js:1)
- Admin audit read API added:
  - `GET /api/admin/audit`
  - Restricted by `audit:read`
  - Filters: date range, actor, action, entity type, entity id, result, pagination
- Admin audit UI added:
  - [admin-portal/src/app/admin/audit/page.tsx](/Users/kamattap/spaces/sacom/admin-portal/src/app/admin/audit/page.tsx:1)
- Retention cleanup added in auth worker:
  - [auth-svc/src/customer-orders/customer-orders.worker.js](/Users/kamattap/spaces/sacom/auth-svc/src/customer-orders/customer-orders.worker.js:1)

## Implemented storage

- Database: MongoDB
- Primary collection: `audit_logs`
- Legacy collection retained for historical pre-change order entries: `order_audit_logs`

### `audit_logs` fields

- `id` / `_id`
- `createdAt` / timestamp
- `service`
- `action`
- `entityType`
- `entityId`
- `entityDisplayId`
- `actor.actorType`
- `actor.userId`
- `actor.email`
- `actor.name`
- `actor.role`
- `actor.roleNames`
- `request.requestId`
- `request.method`
- `request.path`
- `request.ipAddress`
- `request.userAgent`
- `result`
- `failureReason`
- `changes.before`
- `changes.after`
- `metadata`

### `audit_logs` indexes

- `createdAt`
- `action, createdAt`
- `entityType, entityId, createdAt`
- `actor.userId, createdAt`
- `result, createdAt`
- `request.requestId`

## Implemented retention

- Config: `AUDIT_LOG_RETENTION_DAYS`
- Default: `180`
- Cleanup scheduler owner: `auth-svc`
- Cleanup cadence config: `AUDIT_LOG_CLEANUP_INTERVAL_MS`
- Default cleanup cadence: `24h`
- Cleanup behavior: deletes only `audit_logs` rows older than the retention cutoff
- Legacy `order_audit_logs` retention: still none unless migrated later

## Implemented coverage now

- Auth:
  - admin login success/failure
  - customer login success/failure
  - admin logout
  - customer logout
- Users:
  - create
  - update
  - delete
  - disable/enable
- Roles:
  - create
  - update
  - delete
  - permission changes through role updates
- Permissions/config:
  - permission create
  - permission delete
- Catalog/inventory:
  - category create/update/delete
  - product create/update/delete
  - product publish state update
  - variant create/update
  - inventory update
- Orders/fulfillment:
  - all previously audited order/fulfillment actions now write to `audit_logs`

## Remaining out of scope

- Password change/reset audit because there is no password change/reset feature in the current codebase.
- Variant delete audit because there is no variant delete route in the current product API.
- Label view audit because there is no backend state-changing view-label API in the current codebase.
- Historical migration from `order_audit_logs` to `audit_logs`.
