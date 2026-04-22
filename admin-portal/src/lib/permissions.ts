import type { MenuItem } from "@/lib/types";
import { ADMIN_UI_STRINGS } from "@/lib/uiStrings";

export function hasAnyPermission(userPerms: string[], needed: string[]) {
  return needed.some((code) => userPerms.includes(code));
}

export const MENU_ITEMS: MenuItem[] = [
  { href: "/profile", label: ADMIN_UI_STRINGS.menu.profile, anyOf: ["user:read", "role:read", "product:read"] },
  { href: "/sessions", label: ADMIN_UI_STRINGS.menu.sessions, anyOf: ["user:read", "role:read", "product:read"] },
  { href: "/admin/users", label: ADMIN_UI_STRINGS.menu.users, anyOf: ["user:read", "user:write", "user:delete"] },
  { href: "/admin/roles", label: ADMIN_UI_STRINGS.menu.roles, anyOf: ["role:read", "role:create", "role:update", "role:delete"] },
  {
    href: "/admin/permissions",
    label: ADMIN_UI_STRINGS.menu.permissions,
    anyOf: ["permission:read", "permission:create", "permission:delete"],
  },
  { href: "/admin/categories", label: ADMIN_UI_STRINGS.menu.categories, anyOf: ["category:read", "category:write", "category:delete"] },
  { href: "/admin/products", label: ADMIN_UI_STRINGS.menu.products, anyOf: ["product:read", "product:write", "product:delete", "product:publish"] },
  { href: "/admin/inventory", label: ADMIN_UI_STRINGS.menu.inventory, anyOf: ["inventory:read", "inventory:write"] },
  { href: "/admin/system/health", label: ADMIN_UI_STRINGS.menu.systemHealth, anyOf: ["user:read", "role:read", "product:read"] },
  { href: "/admin/audit", label: ADMIN_UI_STRINGS.menu.audit, anyOf: ["user:read", "role:read", "product:read"] },
];
