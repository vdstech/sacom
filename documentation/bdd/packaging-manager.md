# Packaging Manager BDD

This specification documents the current packaging lane behavior implemented for the `PACKAGING_MANAGER` role.

Source alignment:
- Routes and permission guards: `auth-svc/src/customer-orders/customer-orders.admin.routes.js`
- Transition rules: `auth-svc/src/customer-orders/customer-orders.service.js`
- Lane ownership rules: `auth-svc/src/customer-orders/customer-orders.admin.controller.js`
- Workspace actions: `admin-portal/src/components/orders/OrdersWorkspace.tsx`
- Seeded role definition: `auth-svc/src/seed/seedRolesUsers.js`

```gherkin
Feature: Packaging manager receives, verifies, packs, and hands items to shipping
  As a PACKAGING_MANAGER
  I want to control the packaging lane
  So that items are verified, labeled, packed, and handed to shipping in order

  Background:
    Given the admin user is assigned the "PACKAGING_MANAGER" role
    And the admin user has the permissions "order:read" and "order:packaging"
    And the packaging workspace is "/admin/orders/packaging"
    And the packaging queue is loaded from "GET /api/admin/orders/packaging/receipt-queue"

  Scenario: Packaging queue access requires both read and packaging permissions
    Given the admin user is signed in
    When the user opens "/admin/orders/packaging" without "order:read" or without "order:packaging"
    Then the packaging workspace is forbidden
    And the packaging queue is not loaded

  Scenario: Packaging can confirm receipt of a processing handover
    Given an order item is in fulfillment status "HANDED_TO_PACKAGING"
    And a pending handover of type "PROCESSING_TO_PACKAGING" exists
    When the packaging manager uses "POST /api/admin/orders/:id/items/:itemId/confirm-packaging-receipt"
    Then the item fulfillment status becomes "PACKAGING_RECEIVED"
    And the physical owner becomes "PACKAGING_MANAGER"
    And the pending handover is marked received

  Scenario: Packaging can reject receipt and return the item to processing
    Given an order item is in fulfillment status "HANDED_TO_PACKAGING"
    And a pending handover of type "PROCESSING_TO_PACKAGING" exists
    When the packaging manager uses "POST /api/admin/orders/:id/items/:itemId/reject-packaging-receipt" with a rejection reason
    Then the item fulfillment status becomes "PICKED_FROM_WAREHOUSE"
    And the physical owner becomes "PROCESSING_MANAGER"
    And the pending handover is marked rejected

  Scenario: Packaging cannot start work before receipt is confirmed
    Given an order item is in fulfillment status "HANDED_TO_PACKAGING"
    When the packaging manager attempts "POST /api/admin/orders/:id/items/:itemId/start-packaging"
    Then the request is rejected
    And packaging must confirm receipt before packing can begin

  Scenario: Packaging must verify the package before label printing
    Given an order item is in fulfillment status "PACKAGING_IN_PROGRESS"
    And the package verification status is not "VERIFIED"
    When the packaging manager attempts "POST /api/admin/orders/:id/items/:itemId/print-label"
    Then the request is rejected
    And the label status does not become "PRINTED"

  Scenario: Packaging can reprint only after a label has already been printed
    Given an order item is in fulfillment status "PACKAGING_IN_PROGRESS"
    And the label status is not "PRINTED"
    When the packaging manager attempts "POST /api/admin/orders/:id/items/:itemId/reprint-label"
    Then the request is rejected
    And the label reprint count is not increased

  Scenario: Packaging can mark an item packed only after verification and label printing
    Given an order item is in fulfillment status "PACKAGING_IN_PROGRESS"
    And the package verification status is "VERIFIED"
    And the label status is "PRINTED"
    When the packaging manager uses "POST /api/admin/orders/:id/items/:itemId/mark-packed"
    Then the item fulfillment status becomes "PACKED"
    And the physical owner remains "PACKAGING_MANAGER"

  Scenario: A packed packaging-owned item can be handed to shipping
    Given an order item is in fulfillment status "PACKED"
    And the physical owner is "PACKAGING_MANAGER"
    When the packaging manager uses "POST /api/admin/orders/:id/items/:itemId/handover-to-shipping"
    Then the item fulfillment status becomes "HANDED_TO_SHIPPING"
    And a pending handover of type "PACKAGING_TO_SHIPPING" exists
    And the handover moves ownership toward "SHIPPING_OPERATOR"

  Scenario: A cancelled item owned by packaging stays actionable for packaging unless shipping receipt is still pending
    Given an order item is in fulfillment status "CANCEL_REQUESTED"
    And the physical owner is "PACKAGING_MANAGER"
    And there is no pending "PACKAGING_TO_SHIPPING" handover with status "PENDING_RECEIPT"
    When the packaging manager opens the packaging queue
    Then the item remains visible in the packaging lane
    And the workspace shows the action "Hand Over to Cancellation"

  Scenario: A shipping-rejected cancelled handover returns ownership to packaging
    Given an order item is in fulfillment status "CANCEL_REQUESTED"
    And the pending handover type is "PACKAGING_TO_SHIPPING"
    And the pending handover status is "REJECTED"
    And the physical owner is "PACKAGING_MANAGER"
    When the packaging manager opens the packaging queue
    Then the item is visible in the packaging lane
    And the packaging manager remains responsible for handing the item to cancellation
```
