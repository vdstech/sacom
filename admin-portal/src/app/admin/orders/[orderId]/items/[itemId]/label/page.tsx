"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ProtectedPage } from "@/components/ProtectedPage";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/api";
import { ADMIN_UI_STRINGS } from "@/lib/uiStrings";

type AddressSnapshot = {
  fullName?: string;
  phone?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
};

type OrderItemDoc = {
  id: string;
  title: string;
  stockKey?: string;
  quantity: number;
};

type OrderDoc = {
  id: string;
  addressSnapshot?: AddressSnapshot | null;
  items: OrderItemDoc[];
};

function senderLines() {
  return [
    process.env.NEXT_PUBLIC_ORDER_LABEL_SENDER_NAME,
    process.env.NEXT_PUBLIC_ORDER_LABEL_SENDER_LINE1,
    process.env.NEXT_PUBLIC_ORDER_LABEL_SENDER_LINE2,
    [
      process.env.NEXT_PUBLIC_ORDER_LABEL_SENDER_CITY,
      process.env.NEXT_PUBLIC_ORDER_LABEL_SENDER_STATE,
      process.env.NEXT_PUBLIC_ORDER_LABEL_SENDER_POSTAL_CODE,
    ].filter(Boolean).join(", "),
    process.env.NEXT_PUBLIC_ORDER_LABEL_SENDER_PHONE,
  ].filter(Boolean) as string[];
}

function recipientLines(address?: AddressSnapshot | null) {
  if (!address) return [];
  return [
    address.fullName,
    address.line1,
    address.line2,
    [address.city, address.state, address.postalCode].filter(Boolean).join(", "),
    address.country,
    address.phone,
  ].filter(Boolean) as string[];
}

export default function OrderItemLabelPage() {
  const params = useParams<{ orderId: string; itemId: string }>();
  const { accessToken, refreshAccessToken } = useAuth();
  const [order, setOrder] = useState<OrderDoc | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const payload = await apiRequest<{ order: OrderDoc }>(`/api/admin/orders/${encodeURIComponent(params.orderId)}`, {
          token: accessToken,
          onUnauthorized: refreshAccessToken,
        });
        if (!cancelled) {
          setOrder(payload.order);
          setError("");
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, params.orderId, refreshAccessToken]);

  const item = useMemo(
    () => order?.items?.find((entry) => entry.id === params.itemId) || null,
    [order, params.itemId]
  );

  return (
    <ProtectedPage anyOf={["order:packaging", "order:admin"]}>
      <section className="card" style={{ display: "grid", gap: 16 }}>
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <div>
            <div className="orders-detail__eyebrow">{ADMIN_UI_STRINGS.orders.printLabel}</div>
            <h1 style={{ margin: "6px 0 0" }}>Order Packaging Label</h1>
          </div>
          <div className="row">
            <Link href="/admin/orders/packaging"><button className="secondary">{ADMIN_UI_STRINGS.orders.backToQueue}</button></Link>
            <button type="button" className="secondary" onClick={() => window.print()}>{ADMIN_UI_STRINGS.orders.printLabel}</button>
          </div>
        </div>

        {loading ? <div>{ADMIN_UI_STRINGS.common.loadingOrders}</div> : null}
        {error ? <div className="error">{error}</div> : null}
        {!loading && !error && order && item ? (
          <article className="card" style={{ display: "grid", gap: 20, background: "#fff", color: "#111" }}>
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
              <section>
                <div className="orders-detail__eyebrow">Sender</div>
                {senderLines().map((line) => <div key={line}>{line}</div>)}
              </section>
              <section>
                <div className="orders-detail__eyebrow">Ship To</div>
                {recipientLines(order.addressSnapshot).map((line) => <div key={line}>{line}</div>)}
              </section>
            </div>

            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
              <div><strong>Order ID</strong><div>{order.id}</div></div>
              <div><strong>SKU / Stock Key</strong><div>{item.stockKey || "-"}</div></div>
              <div><strong>Quantity</strong><div>{item.quantity}</div></div>
            </div>

            <div>
              <strong>Item</strong>
              <div>{item.title}</div>
            </div>
          </article>
        ) : null}
      </section>
    </ProtectedPage>
  );
}
