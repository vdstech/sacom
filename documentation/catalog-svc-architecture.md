# Catalog Service Architecture

## Purpose
`catalog-svc` owns the category tree and category-level filter configuration used by both admin tooling and the storefront.

## Bounded Responsibility
- create, update, reorder, and publish categories
- expose flat category lists for admin screens
- expose category tree reads for storefront navigation and routing

It does not own products or inventory.

## External Interfaces
- `/api/categories`
- `/api/categories/tree`
- category CRUD/admin routes mounted from the category router

## Important Internal Modules
- `src/categories/category.model.js`
- `src/categories/category.controller.js`
- `src/categories/category.routes.js`

## Request and Data Flow
- Admin reads and writes categories through `admin-portal` -> Next -> gateway -> `catalog-svc`
- Storefront reads category tree through storefront Next proxy -> gateway -> `catalog-svc`

## Storage Ownership
- categories

## Known Constraints and Debt
- Category documents currently embed storefront filter configuration. This is efficient for reads, but it couples taxonomy management and storefront filtering schema.
- Category sort order doubles as storefront menu ordering, which is acceptable today but should remain an explicit design choice.

## Relationship to Other Services
- `product-svc` reads category IDs/slugs indirectly through API usage patterns, but category truth stays in `catalog-svc`
- storefront menu and category pages depend on category `path`, `slug`, and tree hierarchy from this service
