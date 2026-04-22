"use client";

import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { useAuth } from "@/lib/auth";
import { ADMIN_UI_STRINGS } from "@/lib/uiStrings";
import type { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { me, logout, bootstrapError } = useAuth();
  const identity = me?.user?.email ? `${me.user.name} (${me.user.email})` : ADMIN_UI_STRINGS.shell.notSignedIn;

  if (pathname === "/login") {
    return <main className="page">{children}</main>;
  }

  return (
    <div className="layout">
      <Sidebar />
      <div className="content">
        <header className="topbar">
          <div className="row">
            <span>{identity}</span>
            {bootstrapError ? (
              <span className="badge" title={ADMIN_UI_STRINGS.shell.authBootstrapTitle}>
                {ADMIN_UI_STRINGS.shell.authStatusPrefix} {bootstrapError}
              </span>
            ) : null}
          </div>
          <div className="row">
            <button
              onClick={() => router.push("/profile")}
              className="secondary"
            >
              {ADMIN_UI_STRINGS.shell.profile}
            </button>
            <button
              onClick={async () => {
                await logout();
                router.push("/login");
              }}
              className="danger"
            >
              {ADMIN_UI_STRINGS.shell.logout}
            </button>
          </div>
        </header>
        <main className="page">{children}</main>
      </div>
    </div>
  );
}
