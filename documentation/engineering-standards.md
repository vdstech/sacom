# Engineering Standards

## Scope
These standards apply to the active services and frontends in this repo.

## Naming
- Prefer descriptive nouns for DTOs, payloads, and models.
- Prefer intent-revealing names for complex UI state such as `selectedVariantId`, `activeImageIndex`, and `liveRailUnavailable`.
- Avoid legacy-shaped names when the underlying model has changed.

## Configuration and Env Access
- Read environment variables through a small config boundary where practical.
- Local development defaults are allowed only when they are clearly dev-only and documented.
- Do not inline seeded credentials or production-sensitive defaults into UI code.

## Error Handling
- Preserve backend error messages where they are safe and user actionable.
- Distinguish transport failures from HTTP failures in fetch helpers.
- UI should render technical banners for backend failures instead of collapsing the whole page shell.

## DTO Mapping and Pricing
- Backends should normalize storefront DTOs at the controller boundary.
- Effective price is a computed read concern. Do not duplicate discount math across consumers when a shared helper exists.
- Price-range filtering and price display must both use effective price.

## Frontend Data Fetching
- Browser requests should stay same-origin and go through the relevant Next route layer.
- Shared Next-to-gateway transport belongs in one helper, not duplicated per app.
- Page-level components may orchestrate fetches, but repeated transport or parsing logic should move into shared modules.

## Strings
- Centralize user-facing UI strings in app-local string modules.
- Do not force backend logs or validation internals into that same strings layer.

## Comments
- Use file-level comments to explain ownership, boundaries, or non-obvious data flow.
- Use inline comments only for tricky transformations, auth/session checks, or routing logic that would otherwise be surprising.
- Do not add comments that merely restate the code.

## Dead Code and Legacy Modules
- Unmounted or unreachable modules should be removed once confirmed dead.
- Large schema or service redesigns should be documented before execution if they affect ownership boundaries.

## Verification Baseline
Changes should maintain:

- storefront typecheck
- admin portal typecheck
- relevant product tests
- syntax checks on touched backend services
