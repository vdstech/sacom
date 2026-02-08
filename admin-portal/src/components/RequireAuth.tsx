"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import type { ReactNode } from "react";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { me, loading, bootstrapError } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !me) {
      router.replace("/login");
      const timer = window.setTimeout(() => {
        window.location.assign("/login");
      }, 1200);
      return () => window.clearTimeout(timer);
    }
  }, [me, loading, router]);

  if (loading) return <div className="card">Loading...</div>;
  if (bootstrapError) {
    return (
      <div className="card">
        <div>Authentication bootstrap failed: {bootstrapError}</div>
        <button className="secondary" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    );
  }
  if (!me) return <div className="card">Session expired. Redirecting to login...</div>;

  return <>{children}</>;
}
