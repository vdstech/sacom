"use client";

import React, { useEffect, useMemo, useState } from "react";
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

type OrdersDashboardPayload = {
  dashboard: {
    topSellingProducts: Array<{
      id: string;
      label: string;
      count: number;
      revenue: number;
    }>;
    comparisons: {
      weekly: ComparisonBlock;
      monthly: ComparisonBlock;
      yearly: ComparisonBlock;
    };
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
          {block.delta.revenue >= 0 ? "+" : ""}
          {block.delta.revenuePct}%
        </span>
      </header>
      <div className="dashboard-comparison-card__stats">
        <div>
          <strong>{ADMIN_UI_STRINGS.orders.salesCurrentPeriod}</strong>
          <span>{block.current.orders} orders</span>
        </div>
        <div>
          <strong>{ADMIN_UI_STRINGS.orders.salesPreviousPeriod}</strong>
          <span>{formatCurrency(block.previous.revenue)}</span>
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
                  <h2>{ADMIN_UI_STRINGS.orders.salesTopProducts}</h2>
                </div>
              </header>
              {!payload.topSellingProducts.length ? (
                <div className="dashboard-empty">{ADMIN_UI_STRINGS.orders.salesTopProductsEmpty}</div>
              ) : (
                <div className="dashboard-top-products">
                  {payload.topSellingProducts.map((product) => (
                    <div key={product.id} className="dashboard-top-products__item">
                      <div>
                        <strong>{product.label}</strong>
                        <span>{product.count} sold</span>
                      </div>
                      <strong>{formatCurrency(product.revenue)}</strong>
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
