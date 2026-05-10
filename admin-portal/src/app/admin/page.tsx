"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { hasAnyPermission, MENU_ITEMS } from "@/lib/permissions";

export default function AdminIndexPage() {
  const router = useRouter();
  const { loading, me } = useAuth();

  useEffect(() => {
    if (loading) return;

    if (!me) {
      router.replace("/login");
      return;
    }

    const systemLevel = String(me.systemLevel || me.user?.systemLevel || "NONE").toUpperCase();
    const isSystemBypass = systemLevel === "SUPER" || systemLevel === "ADMIN";
    const visibleMenus = new Set(
      isSystemBypass || !me.visibleMenusConfigured
        ? MENU_ITEMS.map((item) => item.id)
        : me.visibleMenus || []
    );
    const allowedMenus = MENU_ITEMS.filter((item) => visibleMenus.has(item.id) && (isSystemBypass || hasAnyPermission(me.permissions || [], item.anyOf)));
    const preferredDashboard = allowedMenus.find((item) => item.id === "ordersDashboard");
    const destination = preferredDashboard?.href || allowedMenus[0]?.href || "/login";

    router.replace(destination);
  }, [loading, me, router]);

  return <section className="card">Loading admin workspace...</section>;
}
