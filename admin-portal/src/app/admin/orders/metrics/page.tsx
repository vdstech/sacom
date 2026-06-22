"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ProtectedPage } from "@/components/ProtectedPage";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { ComparisonBars, LineTrendChart } from "@/components/dashboard/DashboardCharts";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ADMIN_UI_STRINGS } from "@/lib/uiStrings";

type DashboardRangeKey = "today" | "this_week" | "7d" | "this_month" | "30d" | "this_year" | "custom";

type DashboardPoint = {
  period: string;
  label: string;
  orders: number;
  revenue: number;
  granularity: "day" | "week" | "month";
};

type ComparisonBlock = {
  period: string;
  current: {
    revenue: number;
    orders: number;
  };
  previous: {
    revenue: number;
    orders: number;
  };
  delta: {
    revenue: number;
    orders: number;
    revenuePct: number;
    ordersPct: number;
  };
};

type DashboardMetric = {
  id: string;
  label: string;
  count: number;
  revenue: number;
};

type DashboardStatus = {
  key: string;
  label: string;
  count: number;
};

type OrdersDashboardPayload = {
  dashboard: {
    kpis: {
      revenue: number;
      orders: number;
      averageOrderValue: number;
      pendingOrders: number;
      cancelledOrders: number;
    };
    partiallyShipped?: {
      supported: boolean;
      count: number;
      definition: string;
    };
    topSellingProducts: DashboardMetric[];
    topSellingCategories: DashboardMetric[];
    comparisons: {
      weekly: ComparisonBlock;
      monthly: ComparisonBlock;
      yearly: ComparisonBlock;
    };
    ordersByStatus: DashboardStatus[];
    weeklySalesTrend: DashboardPoint[];
    currentYearMonthlyTrend: DashboardPoint[];
    salesTrend: {
      points: DashboardPoint[];
    };
  };
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

function formatDelta(value: number) {
  const rounded = Number.isInteger(value) ? value : Number(value.toFixed(1));
  return `${rounded >= 0 ? "+" : ""}${rounded}%`;
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

function ComparisonCard({ title, block }: { title: string; block: ComparisonBlock }) {
  return (
    <article className="card dashboard-panel dashboard-panel--compact">
      <header className="dashboard-panel__header">
        <div>
          <div className="orders-detail__eyebrow">{title}</div>
          <h2>{formatCurrency(block.current.revenue)}</h2>
        </div>
        <span className={`dashboard-delta ${block.delta.revenue >= 0 ? "is-positive" : "is-negative"}`}>
          {formatDelta(block.delta.revenuePct)}
        </span>
      </header>
      <div className="dashboard-comparison-card__stats">
        <div>
          <strong>{ADMIN_UI_STRINGS.orders.salesCurrentPeriod}</strong>
          <span>{formatCount(block.current.orders)} orders</span>
        </div>
        <div>
          <strong>{ADMIN_UI_STRINGS.orders.salesPreviousPeriod}</strong>
          <span>{formatCurrency(block.previous.revenue)}</span>
        </div>
        <div>
          <strong>{ADMIN_UI_STRINGS.orders.salesChange}</strong>
          <span>{formatDelta(block.delta.ordersPct)} orders</span>
        </div>
      </div>
    </article>
  );
}

export default function OrdersMetricsPage() {
  const { accessToken, refreshAccessToken } = useAuth();
  const [selectedRange, setSelectedRange] = useState<DashboardRangeKey>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [payload, setPayload] = useState<OrdersDashboardPayload["dashboard"] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const query = useMemo(() => buildDashboardQuery(selectedRange, customFrom, customTo), [customFrom, customTo, selectedRange]);

  const load = async () => {
    setLoading(true);
    try {
      const response = await apiRequest<OrdersDashboardPayload>(`/api/admin/orders/dashboard?${query}`, {
        token: accessToken,
        onUnauthorized: refreshAccessToken,
      });
      setPayload(response.dashboard);
      setError("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [query]);

  const executiveCards = payload ? [
    {
      label: ADMIN_UI_STRINGS.orders.overviewRevenue,
      value: formatCurrency(payload.kpis.revenue),
      meta: formatDelta(payload.comparisons.monthly.delta.revenuePct),
      href: "/admin/orders/metrics",
    },
    {
      label: ADMIN_UI_STRINGS.orders.overviewOrders,
      value: formatCount(payload.kpis.orders),
      meta: formatDelta(payload.comparisons.monthly.delta.ordersPct),
      href: "/admin/orders",
    },
    {
      label: ADMIN_UI_STRINGS.orders.overviewAverageOrderValue,
      value: formatCurrency(payload.kpis.averageOrderValue),
      meta: ADMIN_UI_STRINGS.orders.salesCurrentPeriod,
      href: "/admin/orders/metrics",
    },
    {
      label: ADMIN_UI_STRINGS.orders.overviewPendingOrders,
      value: formatCount(payload.kpis.pendingOrders),
      meta: "Requires fulfillment",
      href: "/admin/orders?orderStatus=PLACED,PARTIALLY_PICKED,PICKED,PARTIALLY_PACKED,PACKED,PARTIALLY_SHIPPED,PARTIALLY_CANCELLED",
    },
    {
      label: ADMIN_UI_STRINGS.orders.partiallyShippedOrders,
      value: formatCount(payload.partiallyShipped?.count || 0),
      meta: payload.partiallyShipped?.definition || "",
      href: "/admin/orders?orderStatus=PARTIALLY_SHIPPED",
    },
    {
      label: ADMIN_UI_STRINGS.orders.overviewCancelledOrders,
      value: formatCount(payload.kpis.cancelledOrders),
      meta: "Final cancelled orders",
      href: "/admin/orders?orderStatus=CANCELLED",
    },
  ] : [];

  return (
    <ProtectedPage anyOf={["order:read", "order:admin", "order:processing", "order:packaging", "order:shipping", "order:cancellation"]}>
      <DashboardNav />

      <section className="card dashboard-hero">
        <div className="dashboard-hero__copy">
          <div className="orders-detail__eyebrow">{ADMIN_UI_STRINGS.orders.metricsTitle}</div>
          <h1>{ADMIN_UI_STRINGS.orders.salesTitle}</h1>
          <p>{ADMIN_UI_STRINGS.orders.salesSubtitle}</p>
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
          <button className="secondary" onClick={() => load()}>{ADMIN_UI_STRINGS.common.refresh}</button>
        </div>
      </section>

      {error ? <div className="error">{error}</div> : null}
      {loading ? <section className="card dashboard-empty">{ADMIN_UI_STRINGS.orders.overviewLoading}</section> : null}

      {payload ? (
        <>
          <section className="dashboard-kpi-grid">
            {executiveCards.map((card) => (
              <Link key={card.label} href={card.href} className="dashboard-kpi-link">
                <article className="card dashboard-kpi-card">
                  <span>{card.label}</span>
                  <strong>{card.value}</strong>
                  {card.meta ? <small className="dashboard-kpi-card__meta">{card.meta}</small> : null}
                </article>
              </Link>
            ))}
          </section>

          <section className="dashboard-kpi-grid dashboard-kpi-grid--comparisons">
            <ComparisonCard title={ADMIN_UI_STRINGS.orders.salesWeeklyComparison} block={payload.comparisons.weekly} />
            <ComparisonCard title={ADMIN_UI_STRINGS.orders.salesMonthlyComparison} block={payload.comparisons.monthly} />
            <ComparisonCard title={ADMIN_UI_STRINGS.orders.salesYearlyComparison} block={payload.comparisons.yearly} />
          </section>

          <section className="dashboard-grid dashboard-grid--secondary">
            <article className="card dashboard-panel">
              <header className="dashboard-panel__header">
                <div>
                  <div className="orders-detail__eyebrow">{ADMIN_UI_STRINGS.orders.metricsTitle}</div>
                  <h2>{ADMIN_UI_STRINGS.orders.overviewTrendTitle}</h2>
                </div>
              </header>
              <LineTrendChart
                title={ADMIN_UI_STRINGS.orders.overviewTrendTitle}
                points={payload.salesTrend.points.map((point) => ({
                  label: point.label,
                  revenue: point.revenue,
                  orders: point.orders,
                }))}
              />
            </article>

            <article className="card dashboard-panel">
              <header className="dashboard-panel__header">
                <div>
                  <div className="orders-detail__eyebrow">{ADMIN_UI_STRINGS.orders.metricsTitle}</div>
                  <h2>{ADMIN_UI_STRINGS.orders.salesWeeklyRangeTrend}</h2>
                </div>
              </header>
              <LineTrendChart
                title={ADMIN_UI_STRINGS.orders.salesWeeklyRangeTrend}
                points={payload.weeklySalesTrend.map((point) => ({
                  label: point.label,
                  revenue: point.revenue,
                  orders: point.orders,
                }))}
              />
            </article>
          </section>

          <section className="dashboard-grid dashboard-grid--secondary">
            <article className="card dashboard-panel">
              <header className="dashboard-panel__header">
                <div>
                  <div className="orders-detail__eyebrow">{ADMIN_UI_STRINGS.orders.metricsTitle}</div>
                  <h2>{ADMIN_UI_STRINGS.orders.salesCurrentYearTrend}</h2>
                </div>
              </header>
              <ComparisonBars
                title={ADMIN_UI_STRINGS.orders.salesCurrentYearTrend}
                bars={payload.currentYearMonthlyTrend.map((point) => ({
                  label: point.label,
                  value: point.revenue,
                }))}
              />
            </article>

            <article className="card dashboard-panel">
              <header className="dashboard-panel__header">
                <div>
                  <div className="orders-detail__eyebrow">{ADMIN_UI_STRINGS.orders.overviewStatusEyebrow}</div>
                  <h2>{ADMIN_UI_STRINGS.orders.overviewStatusTitle}</h2>
                </div>
                <Link href="/admin/orders" className="dashboard-inline-link">
                  {ADMIN_UI_STRINGS.orders.overviewStatusClickHint}
                </Link>
              </header>
              <div className="dashboard-status-list">
                {payload.ordersByStatus.map((item) => (
                  <Link
                    key={item.key}
                    href={`/admin/orders?orderStatus=${encodeURIComponent(item.key)}`}
                    className="dashboard-status-list__item dashboard-status-list__item--link"
                  >
                    <div className="dashboard-status-list__copy">
                      <strong>{ADMIN_UI_STRINGS.orders.states[item.key as keyof typeof ADMIN_UI_STRINGS.orders.states] || item.label}</strong>
                      <span>{formatCount(item.count)} orders</span>
                    </div>
                    <div className="dashboard-status-list__bar">
                      <span style={{ width: `${Math.max(10, (item.count / Math.max(...payload.ordersByStatus.map((entry) => entry.count), 1)) * 100)}%` }} />
                    </div>
                  </Link>
                ))}
              </div>
            </article>
          </section>

          <section className="dashboard-grid dashboard-grid--secondary">
            <article className="card dashboard-panel">
              <header className="dashboard-panel__header">
                <div>
                  <div className="orders-detail__eyebrow">{ADMIN_UI_STRINGS.orders.overviewTopSellingEyebrow}</div>
                  <h2>{ADMIN_UI_STRINGS.orders.salesTopProducts}</h2>
                </div>
              </header>
              {!payload.topSellingProducts.length ? (
                <div className="dashboard-empty">{ADMIN_UI_STRINGS.orders.salesTopProductsEmpty}</div>
              ) : (
                <div className="dashboard-top-products">
                  {payload.topSellingProducts.map((product) => (
                    <Link key={product.id} href={`/admin/products/${encodeURIComponent(product.id)}`} className="dashboard-top-products__item">
                      <div>
                        <strong>{product.label}</strong>
                        <span>{formatCount(product.count)} sold</span>
                      </div>
                      <strong>{formatCurrency(product.revenue)}</strong>
                    </Link>
                  ))}
                </div>
              )}
            </article>

            <article className="card dashboard-panel">
              <header className="dashboard-panel__header">
                <div>
                  <div className="orders-detail__eyebrow">{ADMIN_UI_STRINGS.orders.overviewTopSellingEyebrow}</div>
                  <h2>{ADMIN_UI_STRINGS.orders.dashboardTopCategoriesTitle}</h2>
                </div>
              </header>
              {!payload.topSellingCategories.length ? (
                <div className="dashboard-empty">{ADMIN_UI_STRINGS.orders.salesTopProductsEmpty}</div>
              ) : (
                <div className="dashboard-top-products">
                  {payload.topSellingCategories.map((category) => (
                    <div key={category.id} className="dashboard-top-products__item">
                      <div>
                        <strong>{category.label}</strong>
                        <span>{formatCount(category.count)} sold</span>
                      </div>
                      <strong>{formatCurrency(category.revenue)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </article>
          </section>
        </>
      ) : null}
    </ProtectedPage>
  );
}
