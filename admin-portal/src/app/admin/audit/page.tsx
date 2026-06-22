"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ProtectedPage } from "@/components/ProtectedPage";
import { DataTable } from "@/components/DataTable";
import { PaginationControls } from "@/components/PaginationControls";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type AuditLogItem = {
  id: string;
  timestamp: string | null;
  service: string;
  action: string;
  entityType: string;
  entityId: string;
  entityDisplayId: string;
  actor: {
    actorType: string;
    userId: string;
    email: string;
    name: string;
    role: string;
    roleNames: string[];
  };
  request: {
    requestId: string;
    method: string;
    path: string;
    ipAddress: string;
    userAgent: string;
  };
  result: string;
  failureReason: string;
};

type AuditLogsPayload = {
  items: AuditLogItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

function buildQueryString(params: URLSearchParams, overrides: Record<string, string | null>) {
  const next = new URLSearchParams(params.toString());
  for (const [key, value] of Object.entries(overrides)) {
    if (value && value.trim()) next.set(key, value.trim());
    else next.delete(key);
  }
  return next.toString();
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatActor(actor: AuditLogItem["actor"]) {
  const identity = actor.name || actor.email || actor.userId || "System";
  const role = actor.role || actor.roleNames?.[0] || actor.actorType || "UNKNOWN";
  return `${identity} (${role})`;
}

const AUDIT_ACTION_LABELS: Record<string, string> = {
  ISSUE_EXCHANGE_INVESTIGATION_STARTED: "Issue / Exchange Investigation Started",
  ISSUE_EXCHANGE_APPROVED: "Issue / Exchange Approved",
  ISSUE_EXCHANGE_REJECTED: "Issue / Exchange Rejected",
  ISSUE_EXCHANGE_TRACKING_UPDATED: "Issue / Exchange Tracking Updated",
  ISSUE_EXCHANGE_RECEIVED: "Issue / Exchange Received",
  MANUAL_EXTERNAL_RESOLUTION_NOTED: "Manual External Resolution Noted",
  CASH_COUPON_CREATED: "Cash Coupon Created",
  CASH_COUPON_CONSUMED: "Cash Coupon Consumed",
  ROLE_CREATE_REJECTED: "Role Create Rejected",
  ROLE_UPDATE_REJECTED: "Role Update Rejected",
  ROLE_DELETE_REJECTED: "Role Delete Rejected",
  PERMISSION_UPDATE_REJECTED: "Permission Update Rejected",
  PERMISSION_DELETE_REJECTED: "Permission Delete Rejected",
  ADMIN_LOGIN_SUCCEEDED: "Admin Login Succeeded",
  ADMIN_LOGOUT_SUCCEEDED: "Admin Logout Succeeded",
};

function formatAuditAction(action: string) {
  const normalized = String(action || "").trim().toUpperCase();
  if (!normalized) return "-";
  if (AUDIT_ACTION_LABELS[normalized]) return AUDIT_ACTION_LABELS[normalized];
  return normalized
    .split("_")
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1)}${part.slice(1).toLowerCase()}`)
    .join(" ");
}

function AuditPageContent() {
  const { accessToken, refreshAccessToken } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchParamsKey = searchParams.toString();
  const [payload, setPayload] = useState<AuditLogsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    actor: searchParams.get("actor") || "",
    action: searchParams.get("action") || "",
    entityType: searchParams.get("entityType") || "",
    entityId: searchParams.get("entityId") || "",
    result: searchParams.get("result") || "",
    from: searchParams.get("from") || "",
    to: searchParams.get("to") || "",
  });

  useEffect(() => {
    setFilters({
      actor: searchParams.get("actor") || "",
      action: searchParams.get("action") || "",
      entityType: searchParams.get("entityType") || "",
      entityId: searchParams.get("entityId") || "",
      result: searchParams.get("result") || "",
      from: searchParams.get("from") || "",
      to: searchParams.get("to") || "",
    });
  }, [searchParamsKey]);

  const query = useMemo(() => {
    const next = new URLSearchParams();
    next.set("page", searchParams.get("page") || "1");
    next.set("limit", "25");
    for (const key of ["actor", "action", "entityType", "entityId", "result", "from", "to"]) {
      const value = searchParams.get(key);
      if (value) next.set(key, value);
    }
    return next.toString();
  }, [searchParamsKey]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      try {
        const response = await apiRequest<AuditLogsPayload>(`/api/admin/audit?${query}`, {
          token: accessToken,
          onUnauthorized: refreshAccessToken,
        });
        if (!active) return;
        setPayload(response);
        setError("");
      } catch (err) {
        if (!active) return;
        setError((err as Error).message);
        setPayload(null);
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [accessToken, query, refreshAccessToken]);

  const applyFilters = () => {
    const queryString = buildQueryString(searchParams, {
      page: "1",
      actor: filters.actor || null,
      action: filters.action || null,
      entityType: filters.entityType || null,
      entityId: filters.entityId || null,
      result: filters.result || null,
      from: filters.from || null,
      to: filters.to || null,
    });
    router.push(queryString ? `${pathname}?${queryString}` : pathname);
  };

  const clearFilters = () => {
    setFilters({
      actor: "",
      action: "",
      entityType: "",
      entityId: "",
      result: "",
      from: "",
      to: "",
    });
    router.push(pathname);
  };

  const goToPage = (page: number) => {
    const queryString = buildQueryString(searchParams, { page: String(page) });
    router.push(queryString ? `${pathname}?${queryString}` : pathname);
  };

  const rows = (payload?.items || []).map((item) => ([
    formatDate(item.timestamp),
    formatActor(item.actor),
    formatAuditAction(item.action),
    `${item.entityType}${item.entityDisplayId ? `: ${item.entityDisplayId}` : item.entityId ? `: ${item.entityId}` : ""}`,
    item.result,
    `${item.request.method || ""} ${item.request.path || ""}`.trim() || item.service,
  ]));

  return (
    <ProtectedPage anyOf={["audit:read"]}>
      <section className="card dashboard-hero">
        <div className="dashboard-hero__copy">
          <div className="orders-detail__eyebrow">Compliance</div>
          <h1>Audit</h1>
          <p>Query backend audit events by actor, action, entity, result, and date range.</p>
        </div>
        <div className="dashboard-hero__actions">
          <label className="dashboard-filter">
            <span>Actor</span>
            <input value={filters.actor} onChange={(event) => setFilters((current) => ({ ...current, actor: event.target.value }))} />
          </label>
          <label className="dashboard-filter">
            <span>Action</span>
            <input value={filters.action} onChange={(event) => setFilters((current) => ({ ...current, action: event.target.value.toUpperCase() }))} />
          </label>
          <label className="dashboard-filter">
            <span>Entity type</span>
            <input value={filters.entityType} onChange={(event) => setFilters((current) => ({ ...current, entityType: event.target.value.toUpperCase() }))} />
          </label>
          <label className="dashboard-filter">
            <span>Entity id</span>
            <input value={filters.entityId} onChange={(event) => setFilters((current) => ({ ...current, entityId: event.target.value }))} />
          </label>
          <label className="dashboard-filter">
            <span>Result</span>
            <select value={filters.result} onChange={(event) => setFilters((current) => ({ ...current, result: event.target.value }))}>
              <option value="">All</option>
              <option value="SUCCESS">Success</option>
              <option value="FAILURE">Failure</option>
            </select>
          </label>
          <label className="dashboard-filter">
            <span>From</span>
            <input type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} />
          </label>
          <label className="dashboard-filter">
            <span>To</span>
            <input type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} />
          </label>
          <button type="button" onClick={applyFilters}>Apply</button>
          <button type="button" className="secondary" onClick={clearFilters}>Clear</button>
        </div>
      </section>

      {error ? <div className="error">{error}</div> : null}
      {loading ? <section className="card dashboard-empty">Loading audit logs…</section> : null}

      {!loading && payload ? (
        <>
          <section className="card dashboard-panel">
            <header className="dashboard-panel__header">
              <div>
                <div className="orders-detail__eyebrow">Audit events</div>
                <h2>Latest activity</h2>
              </div>
              <span className="dashboard-panel__meta">{payload.total} events</span>
            </header>
            {!payload.items.length ? (
              <div className="dashboard-empty">No audit events matched the current filters.</div>
            ) : (
              <DataTable
                headers={["Timestamp", "Actor", "Action", "Entity", "Result", "Request"]}
                rows={rows}
              />
            )}
          </section>
          <PaginationControls
            page={payload.page}
            totalPages={payload.totalPages}
            total={payload.total}
            onPrevious={() => goToPage(Math.max(1, payload.page - 1))}
            onNext={() => goToPage(Math.min(payload.totalPages, payload.page + 1))}
            previousLabel="Previous"
            nextLabel="Next"
          />
        </>
      ) : null}
    </ProtectedPage>
  );
}

export default function AuditPage() {
  return (
    <Suspense fallback={<section className="card dashboard-empty">Loading audit logs…</section>}>
      <AuditPageContent />
    </Suspense>
  );
}
