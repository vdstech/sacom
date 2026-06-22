"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { MENU_ITEMS, hasAnyPermission } from "@/lib/permissions";

const DASHBOARD_SECTIONS = [
  { id: "ordersDashboard", href: "/admin/orders/dashboard", label: "Overview" },
  { id: "ordersMetrics", href: "/admin/orders/metrics", label: "Sales" },
  { id: "orders", href: "/admin/orders", label: "Orders" },
  { id: "processingManager", href: "/admin/orders/processing", label: "Processing" },
  { id: "packagingManager", href: "/admin/orders/packaging", label: "Packaging" },
  { id: "shippingOperator", href: "/admin/orders/shipping", label: "Shipping" },
  { id: "cancellationManager", href: "/admin/orders/cancellations", label: "Cancellations" },
  { id: "returnExchangeManager", href: "/admin/orders/returns-exchanges", label: "Returns" },
  { id: "inventory", href: "/admin/inventory", label: "Inventory" },
  { id: "products", href: "/admin/products", label: "Products" },
];

export function DashboardNav() {
  const pathname = usePathname();
  const { me } = useAuth();
  const permissions = me?.permissions || [];
  const systemLevel = String(me?.systemLevel || me?.user?.systemLevel || "NONE").toUpperCase();
  const isSystemBypass = systemLevel === "SUPER" || systemLevel === "ADMIN";

  const sections = DASHBOARD_SECTIONS.filter((section) => {
    if (isSystemBypass) return true;
    const menu = MENU_ITEMS.find((item) => item.id === section.id);
    if (!menu) return false;
    return hasAnyPermission(permissions, menu.anyOf);
  });

  return (
    <nav className="dashboard-nav" aria-label="Dashboard sections">
      {sections.map((section) => {
        const active = section.href === "/admin/orders"
          ? pathname === section.href
          : pathname === section.href || pathname.startsWith(`${section.href}/`);
        return (
          <Link
            key={section.href}
            href={section.href}
            className={active ? "dashboard-nav__link is-active" : "dashboard-nav__link"}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
