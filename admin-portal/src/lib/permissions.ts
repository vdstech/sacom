import type { MenuItem } from "@/lib/types";

export function hasAnyPermission(userPerms: string[], needed: string[]) {
  return needed.some((code) => userPerms.includes(code));
}

export const MENU_ITEMS: MenuItem[] = [
  { href: "/profile", label: "Profile", anyOf: ["user:read", "role:read", "product:read"] },
  { href: "/sessions", label: "Sessions", anyOf: ["user:read", "role:read", "product:read"] },
  { href: "/admin/users", label: "Users", anyOf: ["user:read", "user:write", "user:delete"] },
  { href: "/admin/roles", label: "Roles", anyOf: ["role:read", "role:create", "role:update", "role:delete"] },
  {
    href: "/admin/permissions",
    label: "Permissions",
    anyOf: ["permission:read", "permission:create", "permission:delete"],
  },
  { href: "/admin/categories", label: "Categories", anyOf: ["category:read", "category:write", "category:delete"] },
  { href: "/admin/products", label: "Products", anyOf: ["product:read", "product:write", "product:delete", "product:publish"] },
  { href: "/admin/inventory", label: "Inventory", anyOf: ["inventory:read", "inventory:write"] },
  { href: "/admin/navigation", label: "Navigation", anyOf: ["nav:read", "nav:write", "nav:delete", "nav:reorder"] },
  { href: "/admin/system/health", label: "System Health", anyOf: ["user:read", "role:read", "product:read"] },
  { href: "/admin/audit", label: "Audit", anyOf: ["user:read", "role:read", "product:read"] },
];
