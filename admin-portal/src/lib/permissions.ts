import type { MenuItem } from "@/lib/types";
import { ADMIN_UI_STRINGS } from "@/lib/uiStrings";

export function hasAnyPermission(userPerms: string[], needed: string[]) {
  return needed.some((code) => userPerms.includes(code));
}

export const MENU_IDS = [
  "profile",
  "sessions",
  "users",
  "roles",
  "permissions",
  "ordersDashboard",
  "ordersMetrics",
  "processingManager",
  "packagingManager",
  "shippingOperator",
  "cancellationManager",
  "returnExchangeManager",
  "categories",
  "products",
  "orders",
  "inventory",
  "systemHealth",
  "audit",
] as const;

export const MENU_ITEMS: MenuItem[] = [
  { id: "profile", href: "/profile", label: ADMIN_UI_STRINGS.menu.profile, anyOf: ["user:read", "role:read", "product:read"] },
  { id: "sessions", href: "/sessions", label: ADMIN_UI_STRINGS.menu.sessions, anyOf: ["user:read", "role:read", "product:read"] },
  { id: "users", href: "/admin/users", label: ADMIN_UI_STRINGS.menu.users, anyOf: ["user:read", "user:write", "user:delete"] },
  { id: "roles", href: "/admin/roles", label: ADMIN_UI_STRINGS.menu.roles, anyOf: ["role:read", "role:create", "role:update", "role:delete"] },
  {
    id: "permissions",
    href: "/admin/permissions",
    label: ADMIN_UI_STRINGS.menu.permissions,
    anyOf: ["permission:read"],
  },
  { id: "ordersDashboard", href: "/admin/orders/dashboard", label: ADMIN_UI_STRINGS.menu.ordersDashboard, anyOf: ["order:read", "order:admin", "order:processing", "order:packaging", "order:shipping", "order:cancellation"] },
  { id: "ordersMetrics", href: "/admin/orders/metrics", label: ADMIN_UI_STRINGS.menu.ordersMetrics, anyOf: ["order:read", "order:admin", "order:processing", "order:packaging", "order:shipping", "order:cancellation"] },
  { id: "processingManager", href: "/admin/orders/processing", label: ADMIN_UI_STRINGS.menu.processingManager, anyOf: ["order:processing"] },
  { id: "packagingManager", href: "/admin/orders/packaging", label: ADMIN_UI_STRINGS.menu.packagingManager, anyOf: ["order:packaging"] },
  { id: "shippingOperator", href: "/admin/orders/shipping", label: ADMIN_UI_STRINGS.menu.shippingOperator, anyOf: ["order:shipping"] },
  { id: "cancellationManager", href: "/admin/orders/cancellations", label: ADMIN_UI_STRINGS.menu.cancellationManager, anyOf: ["order:cancellation"] },
  { id: "returnExchangeManager", href: "/admin/orders/returns-exchanges", label: ADMIN_UI_STRINGS.menu.returnExchangeManager, anyOf: ["order:return"] },
  { id: "categories", href: "/admin/categories", label: ADMIN_UI_STRINGS.menu.categories, anyOf: ["category:read", "category:create", "category:update", "category:delete"] },
  { id: "products", href: "/admin/products", label: ADMIN_UI_STRINGS.menu.products, anyOf: ["product:read", "product:create", "product:update", "product:delete", "product:publish"] },
  { id: "orders", href: "/admin/orders", label: ADMIN_UI_STRINGS.menu.orders, anyOf: ["order:read", "order:admin", "order:processing", "order:packaging", "order:shipping", "order:cancellation"] },
  { id: "inventory", href: "/admin/inventory", label: ADMIN_UI_STRINGS.menu.inventory, anyOf: ["inventory:read", "product:inventory:update"] },
  { id: "systemHealth", href: "/admin/system/health", label: ADMIN_UI_STRINGS.menu.systemHealth, anyOf: ["user:read", "role:read", "product:read"] },
  { id: "audit", href: "/admin/audit", label: ADMIN_UI_STRINGS.menu.audit, anyOf: ["user:read", "role:read", "product:read"] },
];
