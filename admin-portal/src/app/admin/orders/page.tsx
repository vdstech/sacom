"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ProtectedPage } from "@/components/ProtectedPage";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { OrderOperationsDashboard } from "@/components/orders/OrderOperationsDashboard";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ADMIN_UI_STRINGS } from "@/lib/uiStrings";

type OrderListItem = {
  id: string;
  displayId?: string;
  placedAt: string | null;
  paymentStatus: string;
  fulfillmentStatus: string;
  itemCount: number;
  grandTotal: number;
  currency: string;
  addressSnapshot?: {
    fullName?: string;
  } | null;
};

type OrdersListPayload = {
  items: OrderListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

const STATUS_OPTIONS = [
  "",
  "PLACED,PARTIALLY_PICKED,PICKED,PARTIALLY_PACKED,PACKED,PARTIALLY_SHIPPED,PARTIALLY_CANCELLED",
  "PLACED",
  "PARTIALLY_PICKED",
  "PICKED",
  "PARTIALLY_PACKED",
  "PACKED",
  "PARTIALLY_SHIPPED",
  "SHIPPED",
  "PARTIALLY_CANCELLED",
  "CANCELLED",
] as const;

const STATUS_LABELS: Record<string, string> = {
  "PLACED,PARTIALLY_PICKED,PICKED,PARTIALLY_PACKED,PACKED,PARTIALLY_SHIPPED,PARTIALLY_CANCELLED": "Pending fulfillment",
  PLACED: "Placed",
  PARTIALLY_PICKED: "Picking In Progress",
  PICKED: "Picked",
  PARTIALLY_PACKED: "Packaging In Progress",
  PACKED: "Packed",
  PARTIALLY_SHIPPED: "Shipment In Progress",
  SHIPPED: "Shipped",
  PARTIALLY_CANCELLED: "Partially Cancelled",
  CANCELLED: "Cancelled",
};

function formatCurrency(value: number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
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

function normalizeStatusLabel(value: string) {
  return STATUS_LABELS[String(value || "").toUpperCase()] || value || "Unknown";
}

function buildQueryString(params: URLSearchParams, overrides: Record<string, string | null>) {
  const next = new URLSearchParams(params.toString());
  for (const [key, value] of Object.entries(overrides)) {
    if (value && value.trim()) next.set(key, value.trim());
    else next.delete(key);
  }
  return next.toString();
}

function OrdersPageContent() {
  const { accessToken, refreshAccessToken, me } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [payload, setPayload] = useState<OrdersListPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchInput, setSearchInput] = useState(searchParams.get("search") || "");
  const [statusInput, setStatusInput] = useState(searchParams.get("orderStatus") || "");
  const systemLevel = String(me?.systemLevel || me?.user?.systemLevel || "NONE").toUpperCase();
  const canUseAdminOperations = systemLevel === "ADMIN" || systemLevel === "SUPER";

  useEffect(() => {
    setSearchInput(searchParams.get("search") || "");
    setStatusInput(searchParams.get("orderStatus") || "");
  }, [searchParams]);

  const query = useMemo(() => {
    const next = new URLSearchParams();
    if (searchParams.get("search")) next.set("search", searchParams.get("search") || "");
    if (searchParams.get("orderStatus")) next.set("orderStatus", searchParams.get("orderStatus") || "");
    next.set("limit", "25");
    return next.toString();
  }, [searchParams]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      try {
        const response = await apiRequest<OrdersListPayload>(`/api/admin/orders?${query}`, {
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
      search: searchInput || null,
      orderStatus: statusInput || null,
    });
    router.push(queryString ? `${pathname}?${queryString}` : pathname);
  };

  const handleStatusChange = (nextStatus: string) => {
    setStatusInput(nextStatus);
    const queryString = buildQueryString(searchParams, {
      search: searchInput || null,
      orderStatus: nextStatus || null,
    });
    router.push(queryString ? `${pathname}?${queryString}` : pathname);
  };

  const clearFilters = () => {
    setSearchInput("");
    setStatusInput("");
    router.push(pathname);
  };

  return (
    <ProtectedPage anyOf={["order:read"]}>
      <DashboardNav />

      <section className="card dashboard-hero">
        <div className="dashboard-hero__copy">
          <div className="orders-detail__eyebrow">{ADMIN_UI_STRINGS.orders.ordersDashboardTitle}</div>
          <h1>{ADMIN_UI_STRINGS.orders.ordersListTitle}</h1>
          <p>{ADMIN_UI_STRINGS.orders.ordersDashboardSubtitle}</p>
          <p className="dashboard-panel__help">{ADMIN_UI_STRINGS.orders.overviewPartialShipmentHelp}</p>
        </div>
        <div className="dashboard-hero__actions">
          <label className="dashboard-filter">
            <span>{ADMIN_UI_STRINGS.orders.ordersFilterStatus}</span>
            <select value={statusInput} onChange={(event) => handleStatusChange(event.target.value)}>
              <option value="">{ADMIN_UI_STRINGS.orders.allStatuses}</option>
              {STATUS_OPTIONS.filter(Boolean).map((status) => (
                <option key={status} value={status}>{normalizeStatusLabel(status)}</option>
              ))}
            </select>
          </label>
          <label className="dashboard-filter">
            <span>{ADMIN_UI_STRINGS.orders.ordersFilterSearch}</span>
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Order ID, customer, product, SKU"
            />
          </label>
          <button onClick={applyFilters}>{ADMIN_UI_STRINGS.common.refresh}</button>
          <button type="button" className="secondary" onClick={clearFilters}>
            {ADMIN_UI_STRINGS.orders.ordersFilterClear}
          </button>
        </div>
      </section>

      {error ? <div className="error">{error}</div> : null}
      {loading ? <section className="card dashboard-empty">{ADMIN_UI_STRINGS.common.loadingOrders}</section> : null}

      {canUseAdminOperations ? <OrderOperationsDashboard /> : null}

      {!loading && payload ? (
        <section className="card dashboard-panel">
          <header className="dashboard-panel__header">
            <div>
              <div className="orders-detail__eyebrow">{ADMIN_UI_STRINGS.orders.ordersDashboardTitle}</div>
              <h2>{ADMIN_UI_STRINGS.orders.ordersListTitle}</h2>
            </div>
            <span className="dashboard-panel__meta">{payload.total} orders</span>
          </header>

          {!payload.items.length ? (
            <div className="dashboard-empty">{ADMIN_UI_STRINGS.orders.ordersListEmpty}</div>
          ) : (
            <div className="dashboard-recent-orders">
              {payload.items.map((order) => (
                <div key={order.id} className="dashboard-recent-orders__row">
                  <div>
                    <strong>{order.displayId || order.id}</strong>
                    <span>{order.addressSnapshot?.fullName || "Customer"}</span>
                  </div>
                  <div>
                    <strong>{formatCurrency(order.grandTotal, order.currency)}</strong>
                    <span>{order.itemCount} items</span>
                  </div>
                  <div>
                    <strong>{normalizeStatusLabel(order.fulfillmentStatus)}</strong>
                    <span>{formatDate(order.placedAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="dashboard-list-footer">
            <span className="dashboard-panel__meta">Page {payload.page} of {payload.totalPages}</span>
            {searchParams.get("search") ? (
              <Link href={`${pathname}?${buildQueryString(searchParams, { search: null })}`} className="dashboard-inline-link">
                Clear search
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}
    </ProtectedPage>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<section className="card dashboard-empty">{ADMIN_UI_STRINGS.common.loadingOrders}</section>}>
      <OrdersPageContent />
    </Suspense>
  );
}
