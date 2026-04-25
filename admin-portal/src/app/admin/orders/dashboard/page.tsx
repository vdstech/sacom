"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ProtectedPage } from "@/components/ProtectedPage";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/api";
import { getOrderDashboardBucketMeta } from "@/lib/orderDashboard";
import { ADMIN_UI_STRINGS } from "@/lib/uiStrings";

type DashboardSummary = {
  received: number;
  packed: number;
  shipped: number;
  delivered: number;
  cancelled: number;
  cancelledByAdmin: number;
  paymentFailed: number;
  total: number;
};

export default function OrdersDashboardPage() {
  const { accessToken, refreshAccessToken } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const payload = await apiRequest<{ summary: DashboardSummary }>("/api/admin/orders/dashboard", {
        token: accessToken,
        onUnauthorized: refreshAccessToken,
      });
      setSummary(payload.summary);
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

  const cards = [
    { ...getOrderDashboardBucketMeta("received")!, value: summary?.received || 0 },
    { ...getOrderDashboardBucketMeta("packed")!, value: summary?.packed || 0 },
    { ...getOrderDashboardBucketMeta("shipped")!, value: summary?.shipped || 0 },
    { ...getOrderDashboardBucketMeta("delivered")!, value: summary?.delivered || 0 },
    { ...getOrderDashboardBucketMeta("cancelled")!, value: summary?.cancelled || 0 },
    { ...getOrderDashboardBucketMeta("cancelled-by-admin")!, value: summary?.cancelledByAdmin || 0 },
    { ...getOrderDashboardBucketMeta("payment-failed")!, value: summary?.paymentFailed || 0 },
    { ...getOrderDashboardBucketMeta("total")!, value: summary?.total || 0 },
  ];

  return (
    <ProtectedPage anyOf={["order:read", "order:write"]}>
      <section className="card row" style={{ justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div className="orders-detail__eyebrow">{ADMIN_UI_STRINGS.orders.dashboardTitle}</div>
          <h1 style={{ margin: "6px 0 0" }}>{ADMIN_UI_STRINGS.orders.currentWorkload}</h1>
        </div>
        <div className="row">
          <Link href="/admin/orders"><button className="secondary">{ADMIN_UI_STRINGS.orders.openQueue}</button></Link>
          <Link href="/admin/orders/metrics"><button className="secondary">{ADMIN_UI_STRINGS.menu.ordersMetrics}</button></Link>
          <button className="secondary" onClick={() => load()}>{ADMIN_UI_STRINGS.common.refresh}</button>
        </div>
      </section>

      {error ? <div className="error">{error}</div> : null}
      {loading ? <div>{ADMIN_UI_STRINGS.common.loadingOrders}</div> : null}

      <section className="orders-dashboard-grid">
        {cards.map((card) => (
          <Link key={card.bucket} href={card.href} className="orders-dashboard-link">
            <article className="card orders-dashboard-card">
              <span>{card.label}</span>
              <strong>{card.value}</strong>
            </article>
          </Link>
        ))}
      </section>
    </ProtectedPage>
  );
}
