"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AccountShell } from "@/components/AccountShell";
import { useAccount } from "@/components/AccountProvider";
import { fetchCustomerOrder, fetchCustomerOrders, type CustomerOrder } from "@/lib/accountApi";
import { formatMoney } from "@/lib/pricing";
import { STOREFRONT_STRINGS } from "@/lib/strings";

function getOrderDisplayTotal(order: CustomerOrder) {
  return Number(order.grandTotal ?? order.total ?? 0);
}

export default function OrdersPage() {
  const router = useRouter();
  const { ready, customer, accessToken } = useAccount();
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<CustomerOrder | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ready) return;
    if (!customer || !accessToken) {
      router.replace(`/account/auth?returnTo=${encodeURIComponent("/account/orders")}`);
      return;
    }

    let cancelled = false;
    async function load() {
      try {
        const payload = await fetchCustomerOrders(accessToken);
        if (cancelled) return;
        setOrders(payload.orders || []);
        setSelectedOrder(payload.orders?.[0] || null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : STOREFRONT_STRINGS.account.orders.fallbackError);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [ready, customer, accessToken, router]);

  const loadOrder = async (orderId: string) => {
    if (!accessToken) return;
    const payload = await fetchCustomerOrder(accessToken, orderId);
    setSelectedOrder(payload.order);
  };

  return (
    <AccountShell title={STOREFRONT_STRINGS.account.orders.title} subtitle={STOREFRONT_STRINGS.account.orders.subtitle}>
      {error ? <div className="status-banner status-banner--error">{error}</div> : null}
      {!orders.length ? (
        <div className="coming-soon">
          <h2 className="coming-soon__title">{STOREFRONT_STRINGS.account.orders.emptyTitle}</h2>
          <p className="coming-soon__copy">{STOREFRONT_STRINGS.account.orders.emptyCopy}</p>
        </div>
      ) : (
        <div className="account-orders">
          <div className="account-orders__list">
            {orders.map((order) => (
              <button
                key={order.id}
                type="button"
                className={`account-orders__item ${selectedOrder?.id === order.id ? "is-active" : ""}`}
                onClick={() => loadOrder(order.id)}
              >
                <strong>{STOREFRONT_STRINGS.account.orders.orderPrefix}{order.id.slice(-6).toUpperCase()}</strong>
                <span>{new Date(order.placedAt || "").toLocaleDateString()}</span>
                <span>{order.status}</span>
                <span>{formatMoney(getOrderDisplayTotal(order))}</span>
              </button>
            ))}
          </div>
          <div className="account-orders__detail">
            {selectedOrder ? (
              <>
                <h3>{STOREFRONT_STRINGS.account.orders.orderPrefix}{selectedOrder.id.slice(-6).toUpperCase()}</h3>
                <p className="section-copy">{STOREFRONT_STRINGS.account.orders.status}: {selectedOrder.status}</p>
                <div className="account-orders__lines">
                  {selectedOrder.items.map((item, index) => (
                    <div key={`${item.slug || item.title}-${index}`} className="account-orders__line">
                      <div>
                        <strong>{item.title}</strong>
                        <div className="section-copy">{STOREFRONT_STRINGS.account.orders.qty} {item.quantity}</div>
                      </div>
                      <div>{formatMoney(Number(item.lineGrandTotal ?? item.lineTotal ?? 0))}</div>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </AccountShell>
  );
}
