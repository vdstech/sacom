"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ProtectedPage } from "@/components/ProtectedPage";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { ComparisonBars, LineTrendChart } from "@/components/dashboard/DashboardCharts";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  FULFILLMENT_DASHBOARD_BUCKETS,
  type FulfillmentDashboardBucket,
  type FulfillmentDashboardItem,
  type FulfillmentDashboardResponse,
  type OrdersDashboardTab,
} from "@/lib/orderFulfillmentDashboard";
import { hasAnyPermission } from "@/lib/permissions";
import { ADMIN_UI_STRINGS } from "@/lib/uiStrings";

type DashboardRangeKey = "today" | "this_week" | "7d" | "this_month" | "30d" | "this_year" | "custom";

type DashboardAction = {
  key: string;
  label: string;
  count: number;
  href: string;
  description?: string;
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

type DashboardMetric = {
  id: string;
  label: string;
  count: number;
  revenue: number;
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
      pendingProcessing?: number;
      pendingPackaging?: number;
      pendingShipping?: number;
      cancelledOrders: number;
      issueCases?: number;
      exchangeCases?: number;
      pendingIssueInvestigations?: number;
      couponsIssued?: number;
      couponsIssuedValue?: number;
      couponsConsumed?: number;
      couponsConsumedValue?: number;
      failedCheckouts?: number;
      abandonedCheckouts?: number;
    };
    salesTrend: {
      granularity: "day" | "week" | "month";
      points: DashboardPoint[];
    };
    weeklySalesTrend: DashboardPoint[];
    currentYearMonthlyTrend: DashboardPoint[];
    comparisons: {
      weekly: ComparisonBlock;
      monthly: ComparisonBlock;
      yearly: ComparisonBlock;
    };
    partiallyShipped?: {
      supported: boolean;
      count: number;
      definition: string;
    };
    ordersByStatus: DashboardStatus[];
    recentOrders: DashboardOrder[];
    topSellingProducts: DashboardMetric[];
    topSellingCategories: DashboardMetric[];
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

type InventoryCategoryRisk = {
  categoryId: string;
  categoryName: string;
  lowStockCount: number;
  outOfStockCount: number;
};

type InventoryDashboardSummaryPayload = {
  summary: {
    threshold: number;
    totalActiveProducts: number;
    totalActiveVariants: number;
    lowStockVariantsCount: number;
    outOfStockVariantsCount: number;
    lowStockVariants: InventorySummaryItem[];
    outOfStockVariants: InventorySummaryItem[];
    recentUpdatedItems: InventorySummaryItem[];
    categoryRisk: InventoryCategoryRisk[];
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

function formatDelta(value: number) {
  const rounded = Number.isInteger(value) ? value : Number(value.toFixed(1));
  return `${rounded >= 0 ? "+" : ""}${rounded}%`;
}

function resolveOrderStatusLabel(value: string) {
  return ADMIN_UI_STRINGS.orders.states[value as keyof typeof ADMIN_UI_STRINGS.orders.states] || value || "-";
}

function resolveGenericStatusLabel(value: string) {
  return ADMIN_UI_STRINGS.orders.states[value as keyof typeof ADMIN_UI_STRINGS.orders.states] || value || "-";
}

function resolveSlaBadgeClass(status: string) {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "VIOLATED") return "dashboard-badge dashboard-badge--danger";
  if (normalized === "DELAYED") return "dashboard-badge dashboard-badge--warning";
  return "dashboard-badge";
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

function ComparisonSnapshotCard({
  title,
  block,
}: {
  title: string;
  block: ComparisonBlock;
}) {
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

export default function OrdersDashboardPage() {
  const { accessToken, refreshAccessToken, me } = useAuth();
  const [selectedRange, setSelectedRange] = useState<DashboardRangeKey>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [activeTab, setActiveTab] = useState<OrdersDashboardTab>("overview");
  const [fulfillmentBucket, setFulfillmentBucket] = useState<FulfillmentDashboardBucket>("");
  const [reloadKey, setReloadKey] = useState(0);
  const [dashboard, setDashboard] = useState<OrdersDashboardPayload["dashboard"] | null>(null);
  const [fulfillmentPayload, setFulfillmentPayload] = useState<FulfillmentDashboardResponse | null>(null);
  const [escalationsPayload, setEscalationsPayload] = useState<FulfillmentDashboardResponse | null>(null);
  const [inventorySummary, setInventorySummary] = useState<InventoryDashboardSummaryPayload["summary"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [fulfillmentLoading, setFulfillmentLoading] = useState(false);
  const [escalationsLoading, setEscalationsLoading] = useState(false);
  const [errors, setErrors] = useState({ orderError: "", inventoryError: "" });
  const [tabErrors, setTabErrors] = useState({ fulfillment: "", escalations: "" });

  const systemLevel = String(me?.systemLevel || me?.user?.systemLevel || "NONE").toUpperCase();
  const isSystemBypass = systemLevel === "SUPER" || systemLevel === "ADMIN";
  const permissions = me?.permissions || [];
  const canViewOrders = isSystemBypass || hasAnyPermission(permissions, ["order:read"]);
  const canViewInventory = isSystemBypass || hasAnyPermission(permissions, ["inventory:read", "product:inventory:update"]);
  const canViewFulfillment = canViewOrders && (isSystemBypass || hasAnyPermission(permissions, ["order:dashboard:fulfillment:read"]));
  const canViewEscalations = canViewOrders && (isSystemBypass || hasAnyPermission(permissions, ["order:dashboard:escalations:read"]));
  const dashboardQuery = useMemo(
    () => buildDashboardQuery(selectedRange, customFrom, customTo),
    [customFrom, customTo, selectedRange]
  );
  const availableTabs = useMemo(() => {
    const tabs: OrdersDashboardTab[] = ["overview"];
    if (canViewFulfillment) tabs.push("fulfillment");
    if (canViewEscalations) tabs.push("escalations");
    return tabs;
  }, [canViewEscalations, canViewFulfillment]);

  useEffect(() => {
    if (!availableTabs.includes(activeTab)) {
      setActiveTab(availableTabs[0] || "overview");
    }
  }, [activeTab, availableTabs]);

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

  useEffect(() => {
    if (!canViewFulfillment || activeTab !== "fulfillment") return;
    let active = true;

    const loadFulfillment = async () => {
      setFulfillmentLoading(true);
      try {
        const params = new URLSearchParams();
        if (fulfillmentBucket) params.set("bucket", fulfillmentBucket);
        const response = await apiRequest<FulfillmentDashboardResponse>(
          `/api/admin/orders/dashboard/fulfillment${params.toString() ? `?${params.toString()}` : ""}`,
          {
            token: accessToken,
            onUnauthorized: refreshAccessToken,
          }
        );
        if (active) {
          setFulfillmentPayload(response);
          setTabErrors((current) => ({ ...current, fulfillment: "" }));
        }
      } catch (error) {
        if (active) {
          setFulfillmentPayload(null);
          setTabErrors((current) => ({ ...current, fulfillment: (error as Error).message }));
        }
      } finally {
        if (active) setFulfillmentLoading(false);
      }
    };

    void loadFulfillment();
    return () => {
      active = false;
    };
  }, [accessToken, activeTab, canViewFulfillment, fulfillmentBucket, refreshAccessToken, reloadKey]);

  useEffect(() => {
    if (!canViewEscalations || activeTab !== "escalations") return;
    let active = true;

    const loadEscalations = async () => {
      setEscalationsLoading(true);
      try {
        const response = await apiRequest<FulfillmentDashboardResponse>("/api/admin/orders/dashboard/escalations", {
          token: accessToken,
          onUnauthorized: refreshAccessToken,
        });
        if (active) {
          setEscalationsPayload(response);
          setTabErrors((current) => ({ ...current, escalations: "" }));
        }
      } catch (error) {
        if (active) {
          setEscalationsPayload(null);
          setTabErrors((current) => ({ ...current, escalations: (error as Error).message }));
        }
      } finally {
        if (active) setEscalationsLoading(false);
      }
    };

    void loadEscalations();
    return () => {
      active = false;
    };
  }, [accessToken, activeTab, canViewEscalations, refreshAccessToken, reloadKey]);

  const comparisonCards = dashboard ? [
    { title: ADMIN_UI_STRINGS.orders.salesWeeklyComparison, block: dashboard.comparisons.weekly },
    { title: ADMIN_UI_STRINGS.orders.salesMonthlyComparison, block: dashboard.comparisons.monthly },
    { title: ADMIN_UI_STRINGS.orders.salesYearlyComparison, block: dashboard.comparisons.yearly },
  ] : [];

  const overviewActionCards = useMemo(() => {
    const orderActions = dashboard?.actionRequired || [];
    const inventoryActions = canViewInventory && inventorySummary ? [
      {
        key: "low_stock",
        label: ADMIN_UI_STRINGS.orders.overviewLowStock,
        count: inventorySummary.lowStockVariantsCount,
        href: "/admin/inventory?tab=low-stock",
        description: `Threshold < ${inventorySummary.threshold}`,
      },
      {
        key: "out_of_stock",
        label: ADMIN_UI_STRINGS.orders.overviewOutOfStock,
        count: inventorySummary.outOfStockVariantsCount,
        href: "/admin/inventory?tab=out-of-stock",
        description: "Available stock = 0",
      },
    ] : [];

    return [...orderActions, ...inventoryActions];
  }, [canViewInventory, dashboard?.actionRequired, inventorySummary]);

  const kpiCards = [
    {
      label: ADMIN_UI_STRINGS.orders.overviewRevenue,
      value: canViewOrders && dashboard ? formatCurrency(dashboard.kpis.revenue) : ADMIN_UI_STRINGS.orders.overviewRestricted,
      meta: dashboard ? `${formatDelta(dashboard.comparisons.monthly.delta.revenuePct)} vs previous month` : "",
      href: "/admin/orders/metrics",
      tone: "dashboard-kpi-card dashboard-kpi-card--revenue",
    },
    {
      label: ADMIN_UI_STRINGS.orders.overviewOrders,
      value: canViewOrders && dashboard ? formatCount(dashboard.kpis.orders) : ADMIN_UI_STRINGS.orders.overviewRestricted,
      meta: dashboard ? formatDelta(dashboard.comparisons.monthly.delta.ordersPct) : "",
      href: "/admin/orders",
      tone: "dashboard-kpi-card dashboard-kpi-card--orders",
    },
    {
      label: ADMIN_UI_STRINGS.orders.overviewAverageOrderValue,
      value: canViewOrders && dashboard ? formatCurrency(dashboard.kpis.averageOrderValue) : ADMIN_UI_STRINGS.orders.overviewRestricted,
      meta: dashboard ? "Payable total per paid order" : "",
      href: "/admin/orders/metrics",
      tone: "dashboard-kpi-card dashboard-kpi-card--aov",
    },
    {
      label: ADMIN_UI_STRINGS.orders.overviewPendingProcessing,
      value: canViewOrders && dashboard ? formatCount(dashboard.kpis.pendingProcessing || 0) : ADMIN_UI_STRINGS.orders.overviewRestricted,
      meta: "Orders waiting in processing",
      href: "/admin/orders/processing",
      tone: "dashboard-kpi-card dashboard-kpi-card--pending",
    },
    {
      label: ADMIN_UI_STRINGS.orders.overviewPendingPackaging,
      value: canViewOrders && dashboard ? formatCount(dashboard.kpis.pendingPackaging || 0) : ADMIN_UI_STRINGS.orders.overviewRestricted,
      meta: "Orders waiting in packaging",
      href: "/admin/orders/packaging",
      tone: "dashboard-kpi-card dashboard-kpi-card--orders",
    },
    {
      label: ADMIN_UI_STRINGS.orders.overviewPendingShipping,
      value: canViewOrders && dashboard ? formatCount(dashboard.kpis.pendingShipping || 0) : ADMIN_UI_STRINGS.orders.overviewRestricted,
      meta: "Orders waiting in shipping",
      href: "/admin/orders/shipping",
      tone: "dashboard-kpi-card dashboard-kpi-card--orders",
    },
    {
      label: ADMIN_UI_STRINGS.orders.overviewIssueExchangeInvestigations,
      value: canViewOrders && dashboard ? formatCount(dashboard.kpis.pendingIssueInvestigations || 0) : ADMIN_UI_STRINGS.orders.overviewRestricted,
      meta: canViewOrders && dashboard
        ? `${formatCount(dashboard.kpis.issueCases || 0)} issue cases • ${formatCount(dashboard.kpis.exchangeCases || 0)} exchange cases`
        : "",
      href: "/admin/orders/returns-exchanges",
      tone: "dashboard-kpi-card dashboard-kpi-card--orders",
    },
    {
      label: ADMIN_UI_STRINGS.orders.overviewCashCouponsGenerated,
      value: canViewOrders && dashboard ? formatCurrency(dashboard.kpis.couponsIssuedValue || 0) : ADMIN_UI_STRINGS.orders.overviewRestricted,
      meta: canViewOrders && dashboard ? `${formatCount(dashboard.kpis.couponsIssued || 0)} coupons generated` : "",
      href: "/admin/orders/returns-exchanges",
      tone: "dashboard-kpi-card dashboard-kpi-card--revenue",
    },
    {
      label: ADMIN_UI_STRINGS.orders.overviewCashCouponsConsumed,
      value: canViewOrders && dashboard ? formatCurrency(dashboard.kpis.couponsConsumedValue || 0) : ADMIN_UI_STRINGS.orders.overviewRestricted,
      meta: canViewOrders && dashboard ? `${formatCount(dashboard.kpis.couponsConsumed || 0)} coupons consumed` : "",
      href: "/admin/orders/returns-exchanges",
      tone: "dashboard-kpi-card dashboard-kpi-card--aov",
    },
    {
      label: ADMIN_UI_STRINGS.orders.overviewFailedCheckouts,
      value: canViewOrders && dashboard ? formatCount(dashboard.kpis.failedCheckouts || 0) : ADMIN_UI_STRINGS.orders.overviewRestricted,
      meta: canViewOrders && dashboard ? `${formatCount(dashboard.kpis.abandonedCheckouts || 0)} abandoned sessions` : "",
      href: "/admin/orders/dashboard",
      tone: "dashboard-kpi-card dashboard-kpi-card--cancelled",
    },
    {
      label: ADMIN_UI_STRINGS.orders.overviewLowStock,
      value: canViewInventory && inventorySummary ? formatCount(inventorySummary.lowStockVariantsCount) : ADMIN_UI_STRINGS.orders.overviewRestricted,
      meta: canViewInventory && inventorySummary ? `${formatCount(inventorySummary.totalActiveVariants)} active variants` : "",
      href: "/admin/inventory?tab=low-stock",
      tone: "dashboard-kpi-card dashboard-kpi-card--stock",
    },
    {
      label: ADMIN_UI_STRINGS.orders.overviewOutOfStock,
      value: canViewInventory && inventorySummary ? formatCount(inventorySummary.outOfStockVariantsCount) : ADMIN_UI_STRINGS.orders.overviewRestricted,
      meta: canViewInventory && inventorySummary ? `${formatCount(inventorySummary.totalActiveProducts)} active products` : "",
      href: "/admin/inventory?tab=out-of-stock",
      tone: "dashboard-kpi-card dashboard-kpi-card--cancelled",
    },
  ];

  const dashboardTabs = [
    { key: "overview" as const, label: ADMIN_UI_STRINGS.orders.dashboardTabOverview, visible: true },
    { key: "fulfillment" as const, label: ADMIN_UI_STRINGS.orders.dashboardTabFulfillment, visible: canViewFulfillment },
    { key: "escalations" as const, label: ADMIN_UI_STRINGS.orders.dashboardTabEscalations, visible: canViewEscalations },
  ].filter((tab) => tab.visible);

  const activeFulfillmentItems: FulfillmentDashboardItem[] = activeTab === "fulfillment"
    ? (fulfillmentPayload?.items || [])
    : activeTab === "escalations"
      ? (escalationsPayload?.items || [])
      : [];

  return (
    <ProtectedPage anyOf={["order:read"]}>
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

      <section className="card dashboard-tab-strip">
        <nav className="dashboard-nav" aria-label={ADMIN_UI_STRINGS.orders.dashboardTabsLabel}>
          {dashboardTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={activeTab === tab.key ? "dashboard-nav__link is-active" : "dashboard-nav__link"}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </section>

      {activeTab === "overview" ? (
        <>
          {errors.orderError ? <div className="error">{errors.orderError}</div> : null}
          {errors.inventoryError ? <div className="error">{errors.inventoryError}</div> : null}

          <section className="dashboard-kpi-grid">
            {kpiCards.map((card) => (
              <Link key={card.label} href={card.href} className="dashboard-kpi-link">
                <article className={`card ${card.tone}`}>
                  <span>{card.label}</span>
                  <strong>{loading ? "..." : card.value}</strong>
                  {card.meta ? <small className="dashboard-kpi-card__meta">{card.meta}</small> : null}
                </article>
              </Link>
            ))}
          </section>

          {loading ? <section className="card dashboard-empty">{ADMIN_UI_STRINGS.orders.overviewLoading}</section> : null}

          {!loading && !dashboard && !inventorySummary ? (
            <section className="card dashboard-empty">{ADMIN_UI_STRINGS.orders.overviewEmpty}</section>
          ) : null}

          {!loading && comparisonCards.length ? (
            <section className="dashboard-kpi-grid dashboard-kpi-grid--comparisons">
              {comparisonCards.map((card) => (
                <ComparisonSnapshotCard key={card.title} title={card.title} block={card.block} />
              ))}
            </section>
          ) : null}

          {!loading && dashboard ? (
            <section className="dashboard-grid dashboard-grid--primary">
              <article className="card dashboard-panel">
                <header className="dashboard-panel__header">
                  <div>
                    <div className="orders-detail__eyebrow">{dashboard.range.label}</div>
                    <h2>{ADMIN_UI_STRINGS.orders.overviewTrendTitle}</h2>
                  </div>
                  <Link href="/admin/orders/metrics" className="dashboard-inline-link">
                    {ADMIN_UI_STRINGS.orders.salesTitle}
                  </Link>
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
                    <div className="orders-detail__eyebrow">{ADMIN_UI_STRINGS.orders.dashboardExecutiveSummaryTitle}</div>
                    <h2>{ADMIN_UI_STRINGS.orders.salesCurrentYearTrend}</h2>
                  </div>
                </header>
                <ComparisonBars
                  title={ADMIN_UI_STRINGS.orders.salesCurrentYearTrend}
                  bars={dashboard.currentYearMonthlyTrend.map((point) => ({
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
                  <span className="dashboard-panel__meta">{ADMIN_UI_STRINGS.orders.overviewStatusClickHint}</span>
                </header>
                <div className="dashboard-status-list">
                  {dashboard.ordersByStatus.map((item) => (
                    <Link
                      key={item.key}
                      href={`/admin/orders?orderStatus=${encodeURIComponent(item.key)}`}
                      className="dashboard-status-list__item dashboard-status-list__item--link"
                      title={ADMIN_UI_STRINGS.orders.overviewStatusClickHint}
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
            </section>
          ) : null}

          {!loading && dashboard ? (
            <section className="dashboard-grid dashboard-grid--secondary">
              <article className="card dashboard-panel">
                <header className="dashboard-panel__header">
                  <div>
                    <div className="orders-detail__eyebrow">{ADMIN_UI_STRINGS.orders.dashboardOperationsTitle}</div>
                    <h2>{ADMIN_UI_STRINGS.orders.overviewActionTitle}</h2>
                    <p className="dashboard-panel__help">{ADMIN_UI_STRINGS.orders.overviewActionHint}</p>
                  </div>
                </header>
                <div className="dashboard-operations-grid">
                  {overviewActionCards.map((item) => (
                    <Link key={item.key} href={item.href} className="dashboard-operations-card">
                      <span>{item.label}</span>
                      <strong>{formatCount(item.count)}</strong>
                      <small>{item.description || ADMIN_UI_STRINGS.orders.overviewStatusClickHint}</small>
                    </Link>
                  ))}
                </div>
              </article>

              <article className="card dashboard-panel">
                <header className="dashboard-panel__header">
                  <div>
                    <div className="orders-detail__eyebrow">{ADMIN_UI_STRINGS.orders.overviewTopSellingEyebrow}</div>
                    <h2>{ADMIN_UI_STRINGS.orders.overviewTopSellingTitle}</h2>
                  </div>
                  <Link href="/admin/orders/metrics" className="dashboard-inline-link">
                    {ADMIN_UI_STRINGS.orders.salesTitle}
                  </Link>
                </header>
                {!dashboard.topSellingProducts.length ? (
                  <div className="dashboard-empty">{ADMIN_UI_STRINGS.orders.overviewTopSellingEmpty}</div>
                ) : (
                  <div className="dashboard-top-products">
                    {dashboard.topSellingProducts.slice(0, 6).map((product) => (
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
            </section>
          ) : null}

          {!loading && dashboard && canViewInventory && inventorySummary ? (
            <section className="dashboard-grid dashboard-grid--secondary">
              <article className="card dashboard-panel">
                <header className="dashboard-panel__header">
                  <div>
                    <div className="orders-detail__eyebrow">{ADMIN_UI_STRINGS.orders.dashboardStockHealthTitle}</div>
                    <h2>{ADMIN_UI_STRINGS.orders.dashboardCategoryRiskTitle}</h2>
                    <p className="dashboard-panel__help">{ADMIN_UI_STRINGS.inventory.lowStockRule}</p>
                  </div>
                  <Link href="/admin/inventory" className="dashboard-inline-link">
                    {ADMIN_UI_STRINGS.orders.overviewStatusClickHint}
                  </Link>
                </header>
                <div className="dashboard-operations-grid">
                  <Link href="/admin/inventory" className="dashboard-operations-card">
                    <span>Active Products</span>
                    <strong>{formatCount(inventorySummary.totalActiveProducts)}</strong>
                    <small>Live inventory coverage</small>
                  </Link>
                  <Link href="/admin/inventory" className="dashboard-operations-card">
                    <span>Active Variants</span>
                    <strong>{formatCount(inventorySummary.totalActiveVariants)}</strong>
                    <small>Variant-level stock</small>
                  </Link>
                  <Link href="/admin/inventory?tab=low-stock" className="dashboard-operations-card">
                    <span>{ADMIN_UI_STRINGS.orders.overviewLowStock}</span>
                    <strong>{formatCount(inventorySummary.lowStockVariantsCount)}</strong>
                    <small>{`Threshold < ${inventorySummary.threshold}`}</small>
                  </Link>
                  <Link href="/admin/inventory?tab=out-of-stock" className="dashboard-operations-card">
                    <span>{ADMIN_UI_STRINGS.orders.overviewOutOfStock}</span>
                    <strong>{formatCount(inventorySummary.outOfStockVariantsCount)}</strong>
                    <small>Available stock = 0</small>
                  </Link>
                </div>
                <div className="dashboard-top-products">
                  {inventorySummary.categoryRisk.slice(0, 5).map((category) => (
                    <Link
                      key={category.categoryId}
                      href={`/admin/inventory?categoryId=${encodeURIComponent(category.categoryId)}`}
                      className="dashboard-top-products__item"
                    >
                      <div>
                        <strong>{category.categoryName}</strong>
                        <span>{category.lowStockCount} low stock</span>
                      </div>
                      <strong>{category.outOfStockCount} out</strong>
                    </Link>
                  ))}
                </div>
              </article>

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
            </section>
          ) : null}

          {!loading && canViewInventory && inventorySummary ? (
            <>
              <section className="dashboard-grid dashboard-grid--alerts">
                <article className="card dashboard-panel">
                  <header className="dashboard-panel__header">
                    <div>
                      <div className="orders-detail__eyebrow">{ADMIN_UI_STRINGS.orders.overviewInventoryEyebrow}</div>
                      <h2>{ADMIN_UI_STRINGS.orders.overviewLowStockTitle}</h2>
                      <p className="dashboard-panel__help">{ADMIN_UI_STRINGS.orders.overviewLowStockHelp}</p>
                    </div>
                    <div className="dashboard-panel__header-actions">
                      <span className="dashboard-panel__meta">{formatCount(inventorySummary.lowStockVariantsCount)}</span>
                      <Link href="/admin/inventory?tab=low-stock" className="dashboard-inline-link">
                        {ADMIN_UI_STRINGS.inventory.viewAllLowStock}
                      </Link>
                    </div>
                  </header>
                  <div className="dashboard-panel__help">
                    {ADMIN_UI_STRINGS.inventory.showingCount(inventorySummary.lowStockVariants.length, inventorySummary.lowStockVariantsCount)}
                  </div>
                  {!inventorySummary.lowStockVariants.length ? (
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

              <section className="dashboard-grid dashboard-grid--secondary">
                <article className="card dashboard-panel">
                  <header className="dashboard-panel__header">
                    <div>
                      <div className="orders-detail__eyebrow">{ADMIN_UI_STRINGS.orders.dashboardRecentUpdatesTitle}</div>
                      <h2>{ADMIN_UI_STRINGS.orders.dashboardTopCategoriesTitle}</h2>
                    </div>
                    <Link href="/admin/orders/metrics" className="dashboard-inline-link">
                      {ADMIN_UI_STRINGS.orders.salesTitle}
                    </Link>
                  </header>
                  {!dashboard?.topSellingCategories.length ? (
                    <div className="dashboard-empty">{ADMIN_UI_STRINGS.orders.salesTopProductsEmpty}</div>
                  ) : (
                    <div className="dashboard-top-products">
                      {dashboard.topSellingCategories.slice(0, 6).map((category) => (
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

                <article className="card dashboard-panel">
                  <header className="dashboard-panel__header">
                    <div>
                      <div className="orders-detail__eyebrow">{ADMIN_UI_STRINGS.orders.dashboardRecentUpdatesTitle}</div>
                      <h2>{ADMIN_UI_STRINGS.orders.dashboardRecentUpdatesTitle}</h2>
                    </div>
                    <Link href="/admin/inventory" className="dashboard-inline-link">
                      {ADMIN_UI_STRINGS.orders.overviewStatusClickHint}
                    </Link>
                  </header>
                  {!inventorySummary.recentUpdatedItems.length ? (
                    <div className="dashboard-empty">{ADMIN_UI_STRINGS.inventory.emptyState}</div>
                  ) : (
                    <div className="dashboard-alert-list">
                      {inventorySummary.recentUpdatedItems.map((item) => (
                        <Link key={item.inventoryId} href={`/admin/inventory?search=${encodeURIComponent(item.stockKey)}`} className="dashboard-alert-list__item">
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
            </>
          ) : null}
        </>
      ) : null}

      {activeTab === "fulfillment" ? (
        <>
          <section className="card dashboard-panel">
            <header className="dashboard-panel__header">
              <div>
                <div className="orders-detail__eyebrow">{ADMIN_UI_STRINGS.orders.dashboardTabFulfillment}</div>
                <h2>{ADMIN_UI_STRINGS.orders.fulfillmentTitle}</h2>
                <p className="dashboard-panel__help">{ADMIN_UI_STRINGS.orders.fulfillmentSubtitle}</p>
              </div>
              <label className="dashboard-filter">
                <span>{ADMIN_UI_STRINGS.orders.fulfillmentFilterLabel}</span>
                <select value={fulfillmentBucket} onChange={(event) => setFulfillmentBucket(event.target.value as FulfillmentDashboardBucket)}>
                  {FULFILLMENT_DASHBOARD_BUCKETS.map((bucket) => (
                    <option key={bucket.key || "all"} value={bucket.key}>{bucket.label}</option>
                  ))}
                </select>
              </label>
            </header>
            <div className="dashboard-operations-grid">
              <article className="dashboard-operations-card"><span>Processing</span><strong>{formatCount(fulfillmentPayload?.summary.processing || 0)}</strong><small>Current lane items</small></article>
              <article className="dashboard-operations-card"><span>Packaging</span><strong>{formatCount(fulfillmentPayload?.summary.packaging || 0)}</strong><small>Current lane items</small></article>
              <article className="dashboard-operations-card"><span>Shipping</span><strong>{formatCount(fulfillmentPayload?.summary.shipping || 0)}</strong><small>Current lane items</small></article>
              <article className="dashboard-operations-card"><span>Shipped</span><strong>{formatCount(fulfillmentPayload?.summary.shipped || 0)}</strong><small>Completed shipment</small></article>
            </div>
          </section>
          {tabErrors.fulfillment ? <div className="error">{tabErrors.fulfillment}</div> : null}
          {fulfillmentLoading ? <section className="card dashboard-empty">{ADMIN_UI_STRINGS.orders.fulfillmentLoading}</section> : null}
          {!fulfillmentLoading && !activeFulfillmentItems.length ? (
            <section className="card dashboard-empty">{ADMIN_UI_STRINGS.orders.fulfillmentEmpty}</section>
          ) : null}
        </>
      ) : null}

      {activeTab === "escalations" ? (
        <>
          <section className="card dashboard-panel">
            <header className="dashboard-panel__header">
              <div>
                <div className="orders-detail__eyebrow">{ADMIN_UI_STRINGS.orders.dashboardTabEscalations}</div>
                <h2>{ADMIN_UI_STRINGS.orders.escalationTitle}</h2>
                <p className="dashboard-panel__help">{ADMIN_UI_STRINGS.orders.escalationSubtitle}</p>
              </div>
              <span className="dashboard-panel__meta">{formatCount(escalationsPayload?.summary.violated || 0)}</span>
            </header>
          </section>
          {tabErrors.escalations ? <div className="error">{tabErrors.escalations}</div> : null}
          {escalationsLoading ? <section className="card dashboard-empty">{ADMIN_UI_STRINGS.orders.escalationLoading}</section> : null}
          {!escalationsLoading && !activeFulfillmentItems.length ? (
            <section className="card dashboard-empty">{ADMIN_UI_STRINGS.orders.escalationEmpty}</section>
          ) : null}
        </>
      ) : null}

      {activeTab !== "overview" && activeFulfillmentItems.length ? (
        <section className="dashboard-fulfillment-list">
          {activeFulfillmentItems.map((item) => (
            <article key={`${item.orderId}:${item.itemId}`} className="card dashboard-fulfillment-card">
              <div className="dashboard-fulfillment-card__header">
                <div>
                  <div className="orders-detail__eyebrow">{item.orderDisplayId}</div>
                  <h3>{item.customerName}</h3>
                </div>
                <div className={resolveSlaBadgeClass(item.slaStatus)}>{resolveGenericStatusLabel(item.slaStatus)}</div>
              </div>
              <div className="dashboard-fulfillment-grid">
                <div><span>{ADMIN_UI_STRINGS.orders.orderItemIdLabel}</span><strong>{item.itemId}</strong></div>
                <div><span>{ADMIN_UI_STRINGS.orders.currentStageLabel}</span><strong>{item.currentStage}</strong></div>
                <div><span>{ADMIN_UI_STRINGS.orders.currentOwnerLabel}</span><strong>{item.currentOwner || "-"}</strong></div>
                <div><span>{ADMIN_UI_STRINGS.orders.itemStateLabel}</span><strong>{resolveGenericStatusLabel(item.currentFulfillmentStatus)}</strong></div>
                <div><span>{ADMIN_UI_STRINGS.orders.customerOrderedDateLabel}</span><strong>{formatDate(item.customerOrderedDate)}</strong></div>
                <div><span>{ADMIN_UI_STRINGS.orders.targetCompletionDateLabel}</span><strong>{formatDate(item.targetCompletionDate)}</strong></div>
                <div><span>{ADMIN_UI_STRINGS.orders.laneAssignedAtLabel}</span><strong>{formatDate(item.laneAssignedAt)}</strong></div>
                <div><span>{ADMIN_UI_STRINGS.orders.lastActionedAtLabel}</span><strong>{formatDate(item.lastActionedAt)}</strong></div>
                <div><span>{ADMIN_UI_STRINGS.orders.hoursInLaneLabel}</span><strong>{item.hoursInLane.toFixed(1)}</strong></div>
                {activeTab === "escalations" ? (
                  <div><span>{ADMIN_UI_STRINGS.orders.violationReasonLabel}</span><strong>{item.activeEscalation?.reason || "-"}</strong></div>
                ) : null}
              </div>
              <div className="dashboard-fulfillment-card__footer">
                <Link href={`/admin/orders?search=${encodeURIComponent(item.orderId)}`} className="dashboard-inline-link">
                  {ADMIN_UI_STRINGS.orders.overviewStatusClickHint}
                </Link>
              </div>
            </article>
          ))}
        </section>
      ) : null}
    </ProtectedPage>
  );
}
