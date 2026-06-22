# Order Oversight Dashboard BDD

This specification documents the fulfillment oversight behavior available through permission-based dashboard tabs on `/admin/orders/dashboard`.

Source alignment:
- Dashboard routes and permission guards: `auth-svc/src/customer-orders/customer-orders.admin.routes.js`
- Dashboard payload shaping: `auth-svc/src/customer-orders/customer-orders.admin.controller.js`
- SLA and escalation worker: `auth-svc/src/customer-orders/customer-orders.worker.js`
- Seeded permissions and default role wiring: `auth-svc/src/seed/seedCategoryPermissions.js`, `auth-svc/src/seed/seedRolesUsers.js`
- Dashboard UI tabs: `admin-portal/src/app/admin/orders/dashboard/page.tsx`

```gherkin
Feature: Permission-based fulfillment oversight tabs
  As a dashboard oversight user
  I want separate fulfillment and escalation tabs under the main orders dashboard
  So that I can monitor normal fulfillment flow separately from SLA violations

  Background:
    Given the dashboard page is "/admin/orders/dashboard"
    And the overview tab remains the existing commercial dashboard
    And the fulfillment API is "GET /api/admin/orders/dashboard/fulfillment"
    And the escalations API is "GET /api/admin/orders/dashboard/escalations"

  Scenario: Fulfillment tab access is permission-based
    Given a signed-in user has "order:read" and "order:dashboard:fulfillment:read"
    When the user opens "/admin/orders/dashboard"
    Then the tab "Fulfillment" is shown
    And opening the tab loads "GET /api/admin/orders/dashboard/fulfillment"

  Scenario: Escalations tab access is permission-based
    Given a signed-in user has "order:read" and "order:dashboard:escalations:read"
    When the user opens "/admin/orders/dashboard"
    Then the tab "Escalations" is shown
    And opening the tab loads "GET /api/admin/orders/dashboard/escalations"

  Scenario: Default seeded order admin gets both oversight permissions
    Given the "ORDER_ADMIN" role is seeded
    Then it includes "order:dashboard:fulfillment:read"
    And it includes "order:dashboard:escalations:read"

  Scenario: Fulfillment tab excludes escalated items
    Given an item is in a fulfillment status tracked by processing, packaging, shipping, or shipped
    And the item SLA status is not "VIOLATED"
    When the oversight user opens the "Fulfillment" tab
    Then the item is shown in the fulfillment tab
    And normal escalated items are not mixed into this view

  Scenario: Escalations tab includes only violated items
    Given an item has SLA status "VIOLATED" or an open escalation record
    When the oversight user opens the "Escalations" tab
    Then the item is shown in the escalations tab
    And non-violated fulfillment items are not shown there

  Scenario: Violated items leave fulfillment visibility until resolved
    Given an item appears in the "Fulfillment" tab
    When its current lane exceeds 48 hours
    Then the item no longer appears in the "Fulfillment" tab
    And the item appears in the "Escalations" tab

  Scenario: Overview data remains separate
    Given the user opens "/admin/orders/dashboard"
    When the "Overview" tab is active
    Then the page shows the existing commercial dashboard data
    And it does not mix fulfillment or escalation API datasets into the overview tab
```
