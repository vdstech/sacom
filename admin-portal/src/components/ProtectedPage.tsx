"use client";

import { RequireAuth } from "@/components/RequireAuth";
import { PermissionGate } from "@/components/PermissionGate";
import type { ReactNode } from "react";

export function ProtectedPage({
  anyOf,
  children,
}: {
  anyOf?: string[];
  children: ReactNode;
}) {
  return (
    <RequireAuth>
      {anyOf ? (
        <PermissionGate anyOf={anyOf} fallback={<div className="card">Forbidden</div>}>
          {children}
        </PermissionGate>
      ) : (
        children
      )}
    </RequireAuth>
  );
}
