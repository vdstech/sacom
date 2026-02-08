"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MENU_ITEMS, hasAnyPermission } from "@/lib/permissions";
import { useAuth } from "@/lib/auth";

export function Sidebar() {
  const { me } = useAuth();
  const pathname = usePathname();
  const perms = me?.permissions || [];

  return (
    <aside className="sidebar">
      <div className="sidebar-title">Admin Portal</div>
      <nav className="nav-list">
        {MENU_ITEMS.filter((item) => hasAnyPermission(perms, item.anyOf)).map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
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
