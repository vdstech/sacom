"use client";

import { useAuth } from "@/lib/auth";
import { hasAnyPermission } from "@/lib/permissions";
import type { ReactNode } from "react";

export function PermissionGate({
  anyOf,
  fallback = null,
  children,
}: {
  anyOf: string[];
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const { me } = useAuth();
  const perms = me?.permissions || [];
  if (!hasAnyPermission(perms, anyOf)) return <>{fallback}</>;
  return <>{children}</>;
}
