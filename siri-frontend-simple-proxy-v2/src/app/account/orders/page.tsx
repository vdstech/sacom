"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AccountShell } from "@/components/AccountShell";
import { useAccount } from "@/components/AccountProvider";
import { fetchCustomerOrder, fetchCustomerOrders, type CustomerOrder } from "@/lib/accountApi";
import { formatMoney } from "@/lib/pricing";

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
        if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load orders");
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
    <AccountShell title="Orders" subtitle="Track your recent purchases and view line-item details.">
      {error ? <div className="status-banner status-banner--error">{error}</div> : null}
      {!orders.length ? (
        <div className="coming-soon">
          <h2 className="coming-soon__title">No orders yet.</h2>
          <p className="coming-soon__copy">Your placed orders will appear here once customer checkout starts creating order history.</p>
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
                <strong>Order #{order.id.slice(-6).toUpperCase()}</strong>
                <span>{new Date(order.placedAt || "").toLocaleDateString()}</span>
                <span>{order.status}</span>
                <span>{formatMoney(order.total)}</span>
              </button>
            ))}
          </div>
          <div className="account-orders__detail">
            {selectedOrder ? (
              <>
                <h3>Order #{selectedOrder.id.slice(-6).toUpperCase()}</h3>
                <p className="section-copy">Status: {selectedOrder.status}</p>
                <div className="account-orders__lines">
                  {selectedOrder.items.map((item, index) => (
                    <div key={`${item.slug || item.title}-${index}`} className="account-orders__line">
                      <div>
                        <strong>{item.title}</strong>
                        <div className="section-copy">Qty {item.quantity}</div>
                      </div>
                      <div>{formatMoney(item.lineTotal)}</div>
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
