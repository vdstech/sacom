"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ProtectedPage } from "@/components/ProtectedPage";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/api";
import { ADMIN_UI_STRINGS } from "@/lib/uiStrings";

type MetricCard = {
  label: string;
  value: number;
  revenue?: number;
};

type TimeMetric = {
  period: string;
  count: number;
  revenue?: number;
};

type TopMetric = {
  id: string;
  label: string;
  count: number;
  revenue: number;
};

type MetricsPayload = {
  metrics: {
    totals: {
      paidOrders: number;
      failedPaymentOrders: number;
      grossRevenue: number;
      refundTotal: number;
      soldItems: number;
      cancelledItems: number;
    };
    sold: {
      byDay: TimeMetric[];
      byMonth: TimeMetric[];
      byQuarter: TimeMetric[];
    };
    cancellations: {
      byDay: TimeMetric[];
      byMonth: TimeMetric[];
      byQuarter: TimeMetric[];
    };
    topSellingProducts: TopMetric[];
    topSellingCategories: TopMetric[];
    topCancelledProducts: TopMetric[];
    topCancelledCategories: TopMetric[];
  };
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function MetricTable({ title, rows, showRevenue = false }: { title: string; rows: Array<TimeMetric | TopMetric>; showRevenue?: boolean }) {
  return (
    <section className="card orders-metrics-table">
      <div className="orders-detail__eyebrow">{title}</div>
      {!rows.length ? (
        <p className="section-copy">{ADMIN_UI_STRINGS.orders.metricsNoData}</p>
      ) : (
        <div className="orders-metrics-rows">
          {rows.map((row) => (
            <div key={"period" in row ? row.period : row.id} className="orders-metrics-row">
              <strong>{"period" in row ? row.period : row.label}</strong>
              <span>{row.count}</span>
              {showRevenue ? <span>{formatCurrency(Number(row.revenue || 0))}</span> : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function OrdersMetricsPage() {
  const { accessToken, refreshAccessToken } = useAuth();
  const [payload, setPayload] = useState<MetricsPayload["metrics"] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const response = await apiRequest<MetricsPayload>("/api/admin/orders/metrics", {
        token: accessToken,
        onUnauthorized: refreshAccessToken,
      });
      setPayload(response.metrics);
      setError("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const cards: MetricCard[] = payload ? [
    { label: ADMIN_UI_STRINGS.orders.metricsPaidOrders, value: payload.totals.paidOrders },
    { label: ADMIN_UI_STRINGS.orders.metricsFailedPayments, value: payload.totals.failedPaymentOrders },
    { label: ADMIN_UI_STRINGS.orders.metricsGrossRevenue, value: payload.totals.grossRevenue },
    { label: ADMIN_UI_STRINGS.orders.metricsRefundTotal, value: payload.totals.refundTotal },
    { label: ADMIN_UI_STRINGS.orders.metricsSoldItems, value: payload.totals.soldItems },
    { label: ADMIN_UI_STRINGS.orders.metricsCancelledItems, value: payload.totals.cancelledItems },
  ] : [];

  return (
    <ProtectedPage anyOf={["order:read", "order:admin", "order:processing", "order:packaging", "order:shipping", "order:cancellation"]}>
      <section className="card row" style={{ justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div className="orders-detail__eyebrow">{ADMIN_UI_STRINGS.orders.metricsTitle}</div>
          <h1 style={{ margin: "6px 0 0" }}>{ADMIN_UI_STRINGS.orders.metricsSubtitle}</h1>
        </div>
        <div className="row">
          <Link href="/admin/orders/dashboard"><button className="secondary">{ADMIN_UI_STRINGS.orders.backToDashboard}</button></Link>
          <Link href="/admin/orders"><button className="secondary">{ADMIN_UI_STRINGS.orders.backToQueue}</button></Link>
          <button className="secondary" onClick={() => load()}>{ADMIN_UI_STRINGS.common.refresh}</button>
        </div>
      </section>

      {error ? <div className="error">{error}</div> : null}
      {loading ? <div>{ADMIN_UI_STRINGS.common.loadingOrders}</div> : null}

      <section className="orders-metrics-grid">
        {cards.map((card) => (
          <article key={card.label} className="card orders-dashboard-card">
            <span>{card.label}</span>
            <strong>
              {card.label === ADMIN_UI_STRINGS.orders.metricsGrossRevenue || card.label === ADMIN_UI_STRINGS.orders.metricsRefundTotal
                ? formatCurrency(card.value)
                : card.value}
            </strong>
          </article>
        ))}
      </section>

      <section className="orders-metrics-grid orders-metrics-grid--tables">
        <MetricTable title={ADMIN_UI_STRINGS.orders.metricsSoldByDay} rows={payload?.sold.byDay || []} showRevenue />
        <MetricTable title={ADMIN_UI_STRINGS.orders.metricsSoldByMonth} rows={payload?.sold.byMonth || []} showRevenue />
        <MetricTable title={ADMIN_UI_STRINGS.orders.metricsSoldByQuarter} rows={payload?.sold.byQuarter || []} showRevenue />
        <MetricTable title={ADMIN_UI_STRINGS.orders.metricsCancelledByDay} rows={payload?.cancellations.byDay || []} />
        <MetricTable title={ADMIN_UI_STRINGS.orders.metricsCancelledByMonth} rows={payload?.cancellations.byMonth || []} />
        <MetricTable title={ADMIN_UI_STRINGS.orders.metricsCancelledByQuarter} rows={payload?.cancellations.byQuarter || []} />
        <MetricTable title={ADMIN_UI_STRINGS.orders.metricsTopSellingProducts} rows={payload?.topSellingProducts || []} showRevenue />
        <MetricTable title={ADMIN_UI_STRINGS.orders.metricsTopSellingCategories} rows={payload?.topSellingCategories || []} showRevenue />
        <MetricTable title={ADMIN_UI_STRINGS.orders.metricsTopCancelledProducts} rows={payload?.topCancelledProducts || []} showRevenue />
        <MetricTable title={ADMIN_UI_STRINGS.orders.metricsTopCancelledCategories} rows={payload?.topCancelledCategories || []} showRevenue />
      </section>
    </ProtectedPage>
  );
}
