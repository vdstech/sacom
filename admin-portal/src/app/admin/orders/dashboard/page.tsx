"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ProtectedPage } from "@/components/ProtectedPage";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { LineTrendChart } from "@/components/dashboard/DashboardCharts";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { hasAnyPermission } from "@/lib/permissions";
import { ADMIN_UI_STRINGS } from "@/lib/uiStrings";

type DashboardRangeKey = "today" | "this_week" | "7d" | "this_month" | "30d" | "this_year" | "custom";

type DashboardAction = {
  key: string;
  label: string;
  count: number;
  href: string;
};

type DashboardPoint = {
  period: string;
  label: string;
  orders: number;
  revenue: number;
  granularity: "day" | "week" | "month";
};

type DashboardStatus = {
  key: string;
  label: string;
  count: number;
};

type DashboardOrder = {
  id: string;
  displayId?: string;
  placedAt: string | null;
  customerName: string;
  itemCount: number;
  amount: number;
  currency: string;
  paymentStatus: string;
  fulfillmentStatus: string;
};

type OrdersDashboardPayload = {
  dashboard: {
    range: {
      key: string;
      label: string;
      from: string;
      to: string;
      days: number;
      granularity: "day" | "week" | "month";
    };
    summary: {
      processing: number;
      packaging: number;
      shipping: number;
      cancellations: number;
      shipped: number;
      cancelled: number;
      total: number;
    };
    kpis: {
      revenue: number;
      orders: number;
      averageOrderValue: number;
      pendingOrders: number;
      cancelledOrders: number;
    };
    salesTrend: {
      granularity: "day" | "week" | "month";
      points: DashboardPoint[];
    };
    partiallyShipped?: {
      supported: boolean;
      count: number;
      definition: string;
    };
    ordersByStatus: DashboardStatus[];
    recentOrders: DashboardOrder[];
    actionRequired: DashboardAction[];
  };
};

type InventorySummaryItem = {
  inventoryId: string;
  productId: string;
  variantId: string;
  productTitle: string;
  productSlug: string;
  stockKey: string;
  variantSummary: string;
  sizeLabel: string;
  availableStock: number;
};

type InventoryDashboardSummaryPayload = {
  summary: {
    threshold: number;
    lowStockVariantsCount: number;
    outOfStockVariantsCount: number;
    lowStockVariants: InventorySummaryItem[];
    outOfStockVariants: InventorySummaryItem[];
  };
};

const ORDER_STATUS_LABELS: Record<string, string> = {
  PLACED: "Placed",
  PARTIALLY_PICKED: "Partially Picked",
  PICKED: "Picked",
  PARTIALLY_PACKED: "Partially Packed",
  PACKED: "Packed",
  PARTIALLY_SHIPPED: "Partially Shipped",
  SHIPPED: "Shipped",
  PARTIALLY_CANCELLED: "Partially Cancelled",
  CANCELLED: "Cancelled",
};

const DASHBOARD_RANGES: Array<{ key: DashboardRangeKey; label: string }> = [
  { key: "today", label: ADMIN_UI_STRINGS.orders.rangeToday },
  { key: "this_week", label: ADMIN_UI_STRINGS.orders.rangeThisWeek },
  { key: "7d", label: ADMIN_UI_STRINGS.orders.rangeLast7Days },
  { key: "this_month", label: ADMIN_UI_STRINGS.orders.rangeThisMonth },
  { key: "30d", label: ADMIN_UI_STRINGS.orders.rangeLast30Days },
  { key: "this_year", label: ADMIN_UI_STRINGS.orders.rangeThisYear },
  { key: "custom", label: ADMIN_UI_STRINGS.orders.rangeCustom },
];

const PENDING_ORDER_STATUS_FILTER = "PLACED,PARTIALLY_PICKED,PICKED,PARTIALLY_PACKED,PACKED,PARTIALLY_SHIPPED,PARTIALLY_CANCELLED";

function formatCurrency(value: number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatCount(value: number | null | undefined) {
  return new Intl.NumberFormat("en-IN").format(Number(value || 0));
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function resolveOrderStatusLabel(value: string) {
  return ORDER_STATUS_LABELS[String(value || "").toUpperCase()] || String(value || "Unknown");
}

function buildDashboardQuery(range: DashboardRangeKey, customFrom: string, customTo: string) {
  const params = new URLSearchParams();
  if (range !== "custom") {
    params.set("range", range);
    return params.toString();
  }
  if (customFrom && customTo) {
    params.set("from", customFrom);
    params.set("to", customTo);
    return params.toString();
  }
  params.set("range", "30d");
  return params.toString();
}

export default function OrdersDashboardPage() {
  const { accessToken, refreshAccessToken, me } = useAuth();
  const [selectedRange, setSelectedRange] = useState<DashboardRangeKey>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [dashboard, setDashboard] = useState<OrdersDashboardPayload["dashboard"] | null>(null);
  const [inventorySummary, setInventorySummary] = useState<InventoryDashboardSummaryPayload["summary"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState({ orderError: "", inventoryError: "" });

  const systemLevel = String(me?.systemLevel || me?.user?.systemLevel || "NONE").toUpperCase();
  const isSystemBypass = systemLevel === "SUPER" || systemLevel === "ADMIN";
  const permissions = me?.permissions || [];
  const canViewOrders = isSystemBypass || hasAnyPermission(permissions, ["order:read"]);
  const canViewInventory = isSystemBypass || hasAnyPermission(permissions, ["inventory:read", "product:inventory:update"]);
  const dashboardQuery = useMemo(
    () => buildDashboardQuery(selectedRange, customFrom, customTo),
    [customFrom, customTo, selectedRange]
  );

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      const nextErrors = { orderError: "", inventoryError: "" };

      try {
        if (canViewOrders) {
          const response = await apiRequest<OrdersDashboardPayload>(`/api/admin/orders/dashboard?${dashboardQuery}`, {
            token: accessToken,
            onUnauthorized: refreshAccessToken,
          });
          if (active) setDashboard(response.dashboard);
        } else if (active) {
          setDashboard(null);
        }
      } catch (error) {
        nextErrors.orderError = (error as Error).message;
        if (active) setDashboard(null);
      }

      try {
        if (canViewInventory) {
          const response = await apiRequest<InventoryDashboardSummaryPayload>("/api/admin/products/inventory/dashboard-summary?threshold=2&limit=8", {
            service: "product",
            token: accessToken,
            onUnauthorized: refreshAccessToken,
          });
          if (active) setInventorySummary(response.summary);
        } else if (active) {
          setInventorySummary(null);
        }
      } catch (error) {
        nextErrors.inventoryError = (error as Error).message;
        if (active) setInventorySummary(null);
      }

      if (active) {
        setErrors(nextErrors);
        setLoading(false);
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [accessToken, canViewInventory, canViewOrders, dashboardQuery, refreshAccessToken, reloadKey]);

  const kpiCards = [
    {
      label: ADMIN_UI_STRINGS.orders.overviewRevenue,
      value: canViewOrders && dashboard ? formatCurrency(dashboard.kpis.revenue) : ADMIN_UI_STRINGS.orders.overviewRestricted,
      href: "/admin/orders/metrics",
    },
    {
      label: ADMIN_UI_STRINGS.orders.overviewOrders,
      value: canViewOrders && dashboard ? formatCount(dashboard.kpis.orders) : ADMIN_UI_STRINGS.orders.overviewRestricted,
      href: "/admin/orders",
    },
    {
      label: ADMIN_UI_STRINGS.orders.overviewAverageOrderValue,
      value: canViewOrders && dashboard ? formatCurrency(dashboard.kpis.averageOrderValue) : ADMIN_UI_STRINGS.orders.overviewRestricted,
      href: "/admin/orders/metrics",
    },
    {
      label: ADMIN_UI_STRINGS.orders.overviewPendingOrders,
      value: canViewOrders && dashboard ? formatCount(dashboard.kpis.pendingOrders) : ADMIN_UI_STRINGS.orders.overviewRestricted,
      href: `/admin/orders?orderStatus=${encodeURIComponent(PENDING_ORDER_STATUS_FILTER)}`,
    },
    {
      label: ADMIN_UI_STRINGS.orders.overviewLowStock,
      value: canViewInventory && inventorySummary ? formatCount(inventorySummary.lowStockVariantsCount) : ADMIN_UI_STRINGS.orders.overviewRestricted,
      href: "/admin/inventory",
    },
    {
      label: ADMIN_UI_STRINGS.orders.overviewOutOfStock,
      value: canViewInventory && inventorySummary ? formatCount(inventorySummary.outOfStockVariantsCount) : ADMIN_UI_STRINGS.orders.overviewRestricted,
      href: "/admin/inventory",
    },
  ];

  return (
    <ProtectedPage anyOf={["order:read", "inventory:read", "product:inventory:update"]}>
      <DashboardNav />

      <section className="card dashboard-hero">
        <div className="dashboard-hero__copy">
          <div className="orders-detail__eyebrow">{ADMIN_UI_STRINGS.orders.overviewEyebrow}</div>
          <h1>{ADMIN_UI_STRINGS.orders.overviewTitle}</h1>
          <p>{ADMIN_UI_STRINGS.orders.overviewSubtitle}</p>
        </div>
        <div className="dashboard-hero__actions">
          <label className="dashboard-filter">
            <span>{ADMIN_UI_STRINGS.orders.overviewDateRange}</span>
            <select value={selectedRange} onChange={(event) => setSelectedRange(event.target.value as DashboardRangeKey)}>
              {DASHBOARD_RANGES.map((option) => (
                <option key={option.key} value={option.key}>{option.label}</option>
              ))}
            </select>
          </label>
          {selectedRange === "custom" ? (
            <>
              <label className="dashboard-filter">
                <span>{ADMIN_UI_STRINGS.orders.customFrom}</span>
                <input type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} />
              </label>
              <label className="dashboard-filter">
                <span>{ADMIN_UI_STRINGS.orders.customTo}</span>
                <input type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} />
              </label>
            </>
          ) : null}
          <button className="secondary" onClick={() => setReloadKey((current) => current + 1)}>{ADMIN_UI_STRINGS.common.refresh}</button>
        </div>
      </section>

      {errors.orderError ? <div className="error">{errors.orderError}</div> : null}
      {errors.inventoryError ? <div className="error">{errors.inventoryError}</div> : null}

      <section className="dashboard-kpi-grid">
        {kpiCards.map((card) => (
          <Link key={card.label} href={card.href} className="dashboard-kpi-link">
            <article className="card dashboard-kpi-card">
              <span>{card.label}</span>
              <strong>{loading ? "..." : card.value}</strong>
            </article>
          </Link>
        ))}
      </section>

      {loading ? <section className="card dashboard-empty">{ADMIN_UI_STRINGS.orders.overviewLoading}</section> : null}

      {!loading && !dashboard && !inventorySummary ? (
        <section className="card dashboard-empty">{ADMIN_UI_STRINGS.orders.overviewEmpty}</section>
      ) : null}

      {!loading && dashboard ? (
        <section className="dashboard-grid dashboard-grid--primary">
          <article className="card dashboard-panel">
            <header className="dashboard-panel__header">
              <div>
                <div className="orders-detail__eyebrow">{dashboard.range.label}</div>
                <h2>{ADMIN_UI_STRINGS.orders.overviewTrendTitle}</h2>
              </div>
              <span className="dashboard-panel__meta">{dashboard.salesTrend.granularity}</span>
            </header>
            <LineTrendChart
              title={ADMIN_UI_STRINGS.orders.overviewTrendTitle}
              points={dashboard.salesTrend.points.map((point) => ({
                label: point.label,
                revenue: point.revenue,
                orders: point.orders,
              }))}
            />
          </article>

          <article className="card dashboard-panel">
            <header className="dashboard-panel__header">
              <div>
                <div className="orders-detail__eyebrow">{ADMIN_UI_STRINGS.orders.overviewStatusEyebrow}</div>
                <h2>{ADMIN_UI_STRINGS.orders.overviewStatusTitle}</h2>
                {dashboard.partiallyShipped?.supported ? (
                  <p className="dashboard-panel__help">{ADMIN_UI_STRINGS.orders.overviewPartialShipmentHelp}</p>
                ) : null}
              </div>
              <span className="dashboard-panel__meta">{ADMIN_UI_STRINGS.orders.overviewStatusClickHint}</span>
            </header>
            <div className="dashboard-status-list">
              {dashboard.ordersByStatus.map((item) => (
                <Link
                  key={item.key}
                  href={`/admin/orders?orderStatus=${encodeURIComponent(item.key)}`}
                  className="dashboard-status-list__item dashboard-status-list__item--link"
                  title={item.key === "PARTIALLY_SHIPPED" ? ADMIN_UI_STRINGS.orders.overviewPartialShipmentHelp : ADMIN_UI_STRINGS.orders.overviewStatusClickHint}
                >
                  <div className="dashboard-status-list__copy">
                    <strong>{resolveOrderStatusLabel(item.label)}</strong>
                    <span>{formatCount(item.count)} orders</span>
                  </div>
                  <div className="dashboard-status-list__bar">
                    <span style={{ width: `${Math.max(10, (item.count / Math.max(...dashboard.ordersByStatus.map((entry) => entry.count), 1)) * 100)}%` }} />
                  </div>
                </Link>
              ))}
            </div>
          </article>

          <article className="card dashboard-panel">
            <header className="dashboard-panel__header">
              <div>
                <div className="orders-detail__eyebrow">{ADMIN_UI_STRINGS.orders.overviewActionEyebrow}</div>
                <h2>{ADMIN_UI_STRINGS.orders.overviewActionTitle}</h2>
              </div>
              <span className="dashboard-panel__meta">{formatCount(dashboard.actionRequired.length)}</span>
            </header>
            <div className="dashboard-action-list">
              {dashboard.actionRequired.filter((item) => item.count > 0).map((item) => (
                <Link key={item.key} href={item.href} className="dashboard-action-list__item">
                  <div>
                    <strong>{item.label}</strong>
                    <span>{ADMIN_UI_STRINGS.orders.overviewActionHint}</span>
                  </div>
                  <strong>{formatCount(item.count)}</strong>
                </Link>
              ))}
            </div>
          </article>
        </section>
      ) : null}

      {!loading && dashboard ? (
        <section className="dashboard-grid dashboard-grid--secondary">
          <article className="card dashboard-panel">
            <header className="dashboard-panel__header">
              <div>
                <div className="orders-detail__eyebrow">{ADMIN_UI_STRINGS.orders.overviewRecentEyebrow}</div>
                <h2>{ADMIN_UI_STRINGS.orders.overviewRecentTitle}</h2>
              </div>
            </header>
            <div className="dashboard-recent-orders">
              {dashboard.recentOrders.map((order) => (
                <Link key={order.id} href={`/admin/orders?search=${encodeURIComponent(order.id)}`} className="dashboard-recent-orders__row dashboard-recent-orders__row--link">
                  <div>
                    <strong>{order.displayId || order.id}</strong>
                    <span>{order.customerName}</span>
                  </div>
                  <div>
                    <strong>{formatCurrency(order.amount, order.currency)}</strong>
                    <span>{formatCount(order.itemCount)} items</span>
                  </div>
                  <div>
                    <strong>{resolveOrderStatusLabel(order.fulfillmentStatus)}</strong>
                    <span>{formatDate(order.placedAt)}</span>
                  </div>
                </Link>
              ))}
            </div>
          </article>

          {canViewInventory ? (
            <article className="card dashboard-panel">
              <header className="dashboard-panel__header">
                <div>
                  <div className="orders-detail__eyebrow">{ADMIN_UI_STRINGS.orders.overviewInventoryEyebrow}</div>
                  <h2>{ADMIN_UI_STRINGS.orders.overviewLowStockTitle}</h2>
                  <p className="dashboard-panel__help">{ADMIN_UI_STRINGS.orders.overviewLowStockHelp}</p>
                </div>
                <div className="dashboard-panel__header-actions">
                  <span className="dashboard-panel__meta">{formatCount(inventorySummary?.lowStockVariantsCount || 0)}</span>
                  <Link href="/admin/inventory?tab=low-stock" className="dashboard-inline-link">
                    {ADMIN_UI_STRINGS.inventory.viewAllLowStock}
                  </Link>
                </div>
              </header>
              <div className="dashboard-panel__help">
                {ADMIN_UI_STRINGS.inventory.showingCount(inventorySummary?.lowStockVariants?.length || 0, inventorySummary?.lowStockVariantsCount || 0)}
              </div>
              {!inventorySummary?.lowStockVariants?.length ? (
                <div className="dashboard-empty">{ADMIN_UI_STRINGS.orders.overviewLowStockEmpty}</div>
              ) : (
                <div className="dashboard-alert-list">
                  {inventorySummary.lowStockVariants.map((item) => (
                    <Link key={item.inventoryId} href={`/admin/inventory?tab=low-stock&search=${encodeURIComponent(item.stockKey)}`} className="dashboard-alert-list__item">
                      <div>
                        <strong>{item.productTitle}</strong>
                        <span>{item.variantSummary ? `${item.variantSummary} • ${item.stockKey}` : item.stockKey}</span>
                      </div>
                      <strong>{formatCount(item.availableStock)}</strong>
                    </Link>
                  ))}
                </div>
              )}
            </article>
          ) : null}
        </section>
      ) : null}

      {!loading && inventorySummary ? (
        <section className="dashboard-grid dashboard-grid--alerts">
          <article className="card dashboard-panel">
            <header className="dashboard-panel__header">
              <div>
                <div className="orders-detail__eyebrow">{ADMIN_UI_STRINGS.orders.overviewInventoryEyebrow}</div>
                <h2>{ADMIN_UI_STRINGS.orders.overviewOutOfStockTitle}</h2>
                <p className="dashboard-panel__help">{ADMIN_UI_STRINGS.orders.overviewOutOfStockHelp}</p>
              </div>
              <div className="dashboard-panel__header-actions">
                <span className="dashboard-panel__meta">{formatCount(inventorySummary.outOfStockVariantsCount)}</span>
                <Link href="/admin/inventory?tab=out-of-stock" className="dashboard-inline-link">
                  {ADMIN_UI_STRINGS.inventory.viewAllOutOfStock}
                </Link>
              </div>
            </header>
            <div className="dashboard-panel__help">
              {ADMIN_UI_STRINGS.inventory.showingCount(inventorySummary.outOfStockVariants.length, inventorySummary.outOfStockVariantsCount)}
            </div>
            {!inventorySummary.outOfStockVariants.length ? (
              <div className="dashboard-empty">{ADMIN_UI_STRINGS.orders.overviewOutOfStockEmpty}</div>
            ) : (
              <div className="dashboard-alert-list">
                {inventorySummary.outOfStockVariants.map((item) => (
                  <Link key={item.inventoryId} href={`/admin/inventory?tab=out-of-stock&search=${encodeURIComponent(item.stockKey)}`} className="dashboard-alert-list__item dashboard-alert-list__item--critical">
                    <div>
                      <strong>{item.productTitle}</strong>
                      <span>{item.variantSummary ? `${item.variantSummary} • ${item.stockKey}` : item.stockKey}</span>
                    </div>
                    <strong>{formatCount(item.availableStock)}</strong>
                  </Link>
                ))}
              </div>
            )}
          </article>
        </section>
      ) : null}
    </ProtectedPage>
  );
}
