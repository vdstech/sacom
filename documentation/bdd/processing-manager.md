# Processing Manager BDD

This specification documents the current processing lane behavior implemented for the `PROCESSING_MANAGER` role.

Source alignment:
- Routes and permission guards: `auth-svc/src/customer-orders/customer-orders.admin.routes.js`
- Transition rules: `auth-svc/src/customer-orders/customer-orders.service.js`
- Lane ownership rules: `auth-svc/src/customer-orders/customer-orders.admin.controller.js`
- Workspace actions: `admin-portal/src/components/orders/OrdersWorkspace.tsx`
- Seeded role definition: `auth-svc/src/seed/seedRolesUsers.js`

```gherkin
Feature: Processing manager handles reserved items and packaging handoff
  As a PROCESSING_MANAGER
  I want to work only the processing lane
  So that reserved items are picked and handed to packaging safely

  Background:
    Given the admin user is assigned the "PROCESSING_MANAGER" role
    And the admin user has the permissions "order:read" and "order:processing"
    And the processing workspace is "/admin/orders/processing"
    And the processing queue is loaded from "GET /api/admin/orders/processing/picking-queue"

  Scenario: Processing queue access requires both read and processing permissions
    Given the admin user is signed in
    When the user opens "/admin/orders/processing" without "order:read" or without "order:processing"
    Then the processing workspace is forbidden
    And the processing queue is not loaded

  Scenario: A reserved item appears in the processing queue and can be picked
    Given an order item is in fulfillment status "RESERVED"
    And the item belongs to the processing lane
    When the processing manager opens the processing queue
    Then the item is visible in the processing queue
    And the workspace shows the action "Pick Item"
    When the processing manager picks the item through "POST /api/admin/orders/:id/items/:itemId/pick"
    Then the item fulfillment status becomes "PICKED_FROM_WAREHOUSE"
    And the physical owner becomes "PROCESSING_MANAGER"

  Scenario: A picked processing-owned item can be handed to packaging
    Given an order item is in fulfillment status "PICKED_FROM_WAREHOUSE"
    And the physical owner is "PROCESSING_MANAGER"
    When the processing manager uses "POST /api/admin/orders/:id/items/:itemId/handover-to-packaging"
    Then the item fulfillment status becomes "HANDED_TO_PACKAGING"
    And a pending handover of type "PROCESSING_TO_PACKAGING" exists
    And the handover moves ownership toward "PACKAGING_MANAGER"

  Scenario: A non-reserved item cannot be picked
    Given an order item is not in fulfillment status "RESERVED"
    When the processing manager attempts to pick the item
    Then the request is rejected
    And the item keeps its current fulfillment status
    And the processing lane does not treat the item as newly picked

  Scenario: A customer cancellation after pick stays with processing until cancellation handoff
    Given an order item is in fulfillment status "CANCEL_REQUESTED"
    And the physical owner is "PROCESSING_MANAGER"
    When the processing manager views the processing queue
    Then the item remains in the processing lane
    And the item does not appear in the cancellation lane yet
    And the workspace shows the action "Hand Over to Cancellation"
    When the processing manager hands the item to cancellation
    Then the item leaves the processing lane

  Scenario: Processing does not own packaging or shipping actions
    Given the processing manager is viewing a processing-lane item
    When the workspace renders item actions
    Then packaging actions are not shown
    And shipping actions are not shown
    And the processing manager can only use processing-lane actions or cancellation handoff when applicable
```
