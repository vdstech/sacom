# AGENTS.md

## Project rules

- Follow the existing backend and frontend folder structure.
- Do not rewrite unrelated modules.
- Prefer minimal, high-confidence changes.
- Reuse existing auth, RBAC, navigation, API client, layout, table, card, and chart patterns.
- Do not add new dependencies unless absolutely necessary.
- If a dependency is required, explain why before adding it.
- Keep UI professional, responsive, and manager-friendly.
- Use real backend data. Do not hardcode dashboard metrics in production UI.
- Add loading, empty, and error states for every dashboard section.
- Run available lint/build/tests after code changes.

## Dashboard goals

Build role-based dashboards for store owners, admins, order managers, and product managers.

The main dashboard should help the user quickly understand:
- revenue
- orders
- pending work
- top products
- low stock
- customer activity
- actions requiring attention

## Implementation priority

1. Owner / Manager Overview Dashboard
2. Admin Operations Dashboard
3. Product / Inventory Dashboard
4. Customer Dashboard

## Quality expectations

- Dashboard cards should be clickable when possible.
- APIs should return stable JSON shapes even when there is no data.
- Backend aggregation should handle nulls and empty results safely.
- Role-based visibility must use the existing RBAC system.
- Do not expose raw technical/database field names in the UI.