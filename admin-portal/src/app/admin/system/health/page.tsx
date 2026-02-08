"use client";

import { useEffect, useState } from "react";
import { ProtectedPage } from "@/components/ProtectedPage";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/api";

type Health = { ok: boolean; service: string; time: string };

const endpoints = [
  { label: "Gateway", path: "/api/system/health/gateway", service: "auth" as const },
  { label: "Auth", path: "/api/system/health/auth", service: "auth" as const },
  { label: "Catalog", path: "/api/system/health/catalog", service: "auth" as const },
  { label: "Product", path: "/api/system/health/product", service: "auth" as const },
  { label: "Navigation", path: "/api/system/health/navigation", service: "auth" as const },
];

export default function HealthPage() {
  const { accessToken, refreshAccessToken } = useAuth();
  const [checks, setChecks] = useState<Array<{ label: string; status: string; message: string }>>([]);

  useEffect(() => {
    (async () => {
      const results = await Promise.all(
        endpoints.map(async (endpoint) => {
          try {
            const payload = await apiRequest<Health>(endpoint.path, {
              service: endpoint.service,
              token: accessToken,
              onUnauthorized: refreshAccessToken,
            });
            return { label: endpoint.label, status: payload.ok ? "UP" : "DOWN", message: payload.time };
          } catch (err) {
            return { label: endpoint.label, status: "DOWN", message: (err as Error).message };
          }
        })
      );
      setChecks(results);
    })();
  }, []);

  return (
    <ProtectedPage>
      <section className="card">
        <h1>System Health</h1>
        <ul>
          {checks.map((check) => (
            <li key={check.label}>{check.label}: {check.status} ({check.message})</li>
          ))}
        </ul>
      </section>
    </ProtectedPage>
  );
}
