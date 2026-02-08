"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export default function HomePage() {
  const router = useRouter();
  const { me, loading, bootstrapError } = useAuth();
  const hasSession = !!(me?.user?.email && me?.user?.name);

  useEffect(() => {
    if (bootstrapError) return;
    if (!loading) {
      router.replace(hasSession ? "/profile" : "/login");
      return;
    }

    // Failsafe to avoid getting stuck on "/" if auth bootstrap hangs.
    const timer = window.setTimeout(() => {
      router.replace("/login");
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [loading, hasSession, bootstrapError, router]);

  if (bootstrapError) {
    return (
      <section className="card">
        <h1>Auth bootstrap issue</h1>
        <p>Reason: {bootstrapError}</p>
        <div className="row">
          <button onClick={() => router.push("/login")}>Go to login</button>
          <button className="secondary" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      </section>
    );
  }

  return <div className="card">Redirecting...</div>;
}
