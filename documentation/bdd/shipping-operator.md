# Shipping Operator BDD

This specification documents the current shipping lane behavior implemented for the `SHIPPING_OPERATOR` role.

Source alignment:
- Routes and permission guards: `auth-svc/src/customer-orders/customer-orders.admin.routes.js`
- Transition rules: `auth-svc/src/customer-orders/customer-orders.service.js`
- Lane ownership rules: `auth-svc/src/customer-orders/customer-orders.admin.controller.js`
- Workspace actions: `admin-portal/src/components/orders/OrdersWorkspace.tsx`
- Seeded role definition: `auth-svc/src/seed/seedRolesUsers.js`

```gherkin
Feature: Shipping operator receives packed items and completes shipment
  As a SHIPPING_OPERATOR
  I want to control the shipping lane
  So that packed items are received, assigned to a courier, tracked, and marked shipped correctly

  Background:
    Given the admin user is assigned the "SHIPPING_OPERATOR" role
    And the admin user has the permissions "order:read" and "order:shipping"
    And the shipping workspace is "/admin/orders/shipping"
    And the shipping queue is loaded from "GET /api/admin/orders/shipping/receipt-queue"

  Scenario: Shipping queue access requires both read and shipping permissions
    Given the admin user is signed in
    When the user opens "/admin/orders/shipping" without "order:read" or without "order:shipping"
    Then the shipping workspace is forbidden
    And the shipping queue is not loaded

  Scenario: Shipping can confirm receipt of a packaging handover
    Given an order item is in fulfillment status "HANDED_TO_SHIPPING"
    And a pending handover of type "PACKAGING_TO_SHIPPING" exists
    When the shipping operator uses "POST /api/admin/orders/:id/items/:itemId/confirm-shipping-receipt"
    Then the item fulfillment status becomes "SHIPPING_RECEIVED"
    And the physical owner becomes "SHIPPING_OPERATOR"
    And the pending handover is marked received

  Scenario: Shipping can reject receipt and return the item to packaging
    Given an order item is in fulfillment status "HANDED_TO_SHIPPING"
    And a pending handover of type "PACKAGING_TO_SHIPPING" exists
    When the shipping operator uses "POST /api/admin/orders/:id/items/:itemId/reject-shipping-receipt" with a rejection reason
    Then the item fulfillment status becomes "PACKED"
    And the physical owner becomes "PACKAGING_MANAGER"
    And the pending handover is marked rejected

  Scenario: Shipping cannot start work before receipt is confirmed
    Given an order item is in fulfillment status "HANDED_TO_SHIPPING"
    When the shipping operator attempts "POST /api/admin/orders/:id/items/:itemId/start-shipping"
    Then the request is rejected
    And shipping must confirm receipt before shipment can begin

  Scenario: Shipping can assign a courier only while shipping is in progress
    Given an order item is not in fulfillment status "SHIPPING_IN_PROGRESS"
    When the shipping operator attempts "POST /api/admin/orders/:id/items/:itemId/assign-courier"
    Then the request is rejected
    And the courier name is not saved

  Scenario: Tracking number entry requires a courier to already be set
    Given an order item is in fulfillment status "SHIPPING_IN_PROGRESS"
    And the courier name is empty
    When the shipping operator attempts "POST /api/admin/orders/:id/items/:itemId/tracking"
    Then the request is rejected
    And the outbound tracking number is not saved

  Scenario: Shipping can mark an item shipped only after courier and tracking are present
    Given an order item is in fulfillment status "SHIPPING_IN_PROGRESS"
    And the courier name is set
    And the outbound tracking number is set
    When the shipping operator uses "POST /api/admin/orders/:id/items/:itemId/mark-shipped"
    Then the item fulfillment status becomes "SHIPPED"
    And the physical owner becomes "COURIER"

  Scenario: The shipping workspace does not expose Mark Delivered
    Given the shipping operator is viewing the shipping workspace
    When the workspace renders shipping-lane item actions
    Then the action "Confirm Shipping Receipt" can be shown when the state allows it
    And the action "Mark Delivered" is not shown in the shipping workspace

  Scenario: A cancellation requested during shipping handover must be resolved by receipt confirm or reject first
    Given an order item is in fulfillment status "CANCEL_REQUESTED"
    And the pending handover type is "PACKAGING_TO_SHIPPING"
    And the pending handover status is "PENDING_RECEIPT"
    When the shipping operator opens the shipping queue
    Then the item remains actionable in the shipping lane
    And the shipping operator can confirm or reject shipping receipt
    And the item is not treated as packaging-owned until that receipt decision is made

  Scenario: A cancelled item owned by shipping stays in shipping until handed to cancellation
    Given an order item is in fulfillment status "CANCEL_REQUESTED"
    And the physical owner is "SHIPPING_OPERATOR"
    When the shipping operator opens the shipping queue
    Then the item remains visible in the shipping lane
    And the workspace shows the action "Hand Over to Cancellation"
    And the item does not appear in the cancellation lane yet
```
