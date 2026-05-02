"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MENU_ITEMS, hasAnyPermission } from "@/lib/permissions";
import { useAuth } from "@/lib/auth";
import { ADMIN_UI_STRINGS } from "@/lib/uiStrings";

export function Sidebar() {
  const { me } = useAuth();
  const pathname = usePathname();
  const systemLevel = String(me?.systemLevel || me?.user?.systemLevel || "NONE").toUpperCase();
  const isSystemBypass = systemLevel === "SUPER" || systemLevel === "ADMIN";
  const perms = me?.permissions || [];
  const visibleMenus = new Set(
    !me || isSystemBypass || !me.visibleMenusConfigured
      ? MENU_ITEMS.map((item) => item.id)
      : me.visibleMenus || []
  );
  const isOrdersSubPath = [
    "/admin/orders/dashboard",
    "/admin/orders/metrics",
    "/admin/orders/processing",
    "/admin/orders/packaging",
    "/admin/orders/shipping",
    "/admin/orders/cancellations",
    "/admin/orders/returns-exchanges",
  ].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

  return (
    <aside className="sidebar">
      <div className="sidebar-title">{ADMIN_UI_STRINGS.brand.portalTitle}</div>
      <nav className="nav-list">
        {MENU_ITEMS.filter((item) => visibleMenus.has(item.id) && (isSystemBypass || hasAnyPermission(perms, item.anyOf))).map((item) => {
          const active = item.href === "/admin/orders"
            ? !isOrdersSubPath && (pathname === item.href || pathname.startsWith(`${item.href}/`))
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link key={item.href} href={item.href} className={active ? "nav-link active" : "nav-link"}>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
