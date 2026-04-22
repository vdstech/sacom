"use client";

import { useEffect, useState } from "react";
import { ProtectedPage } from "@/components/ProtectedPage";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/api";
import { ADMIN_UI_STRINGS } from "@/lib/uiStrings";

type Health = { ok: boolean; service: string; time: string };

const endpoints = [
  { label: ADMIN_UI_STRINGS.health.services.gateway, path: "/api/system/health/gateway", service: "auth" as const },
  { label: ADMIN_UI_STRINGS.health.services.auth, path: "/api/system/health/auth", service: "auth" as const },
  { label: ADMIN_UI_STRINGS.health.services.catalog, path: "/api/system/health/catalog", service: "auth" as const },
  { label: ADMIN_UI_STRINGS.health.services.product, path: "/api/system/health/product", service: "auth" as const },
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
            return { label: endpoint.label, status: payload.ok ? ADMIN_UI_STRINGS.health.up : ADMIN_UI_STRINGS.health.down, message: payload.time };
          } catch (err) {
            return { label: endpoint.label, status: ADMIN_UI_STRINGS.health.down, message: (err as Error).message };
          }
        })
      );
      setChecks(results);
    })();
  }, []);

  return (
    <ProtectedPage>
      <section className="card">
        <h1>{ADMIN_UI_STRINGS.health.title}</h1>
        <ul>
          {checks.map((check) => (
            <li key={check.label}>{check.label}: {check.status} ({check.message})</li>
          ))}
        </ul>
      </section>
    </ProtectedPage>
  );
}
