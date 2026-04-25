"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AccountShell } from "@/components/AccountShell";
import { useAccount } from "@/components/AccountProvider";
import {
  cancelCustomerOrderItem,
  fetchCustomerOrder,
  fetchCustomerOrders,
  requestCustomerOrderItemReturn,
  type CustomerOrder,
  type CustomerOrderItem,
} from "@/lib/accountApi";
import { formatMoney } from "@/lib/pricing";
import { STOREFRONT_STRINGS } from "@/lib/strings";

function getOrderDisplayTotal(order: CustomerOrder) {
  return Number(order.grandTotal ?? order.total ?? 0);
}

function getItemDisplayTotal(item: CustomerOrderItem) {
  return Number(item.lineGrandTotal ?? item.lineTotal ?? 0);
}

function getStateLabel(status?: string) {
  if (!status) return STOREFRONT_STRINGS.account.orders.states.processing;
  return STOREFRONT_STRINGS.account.orders.states[status as keyof typeof STOREFRONT_STRINGS.account.orders.states] || status;
}

function getPaymentStatusLabel(status?: string) {
  if (!status) return STOREFRONT_STRINGS.account.orders.paymentStates.paid;
  return STOREFRONT_STRINGS.account.orders.paymentStates[
    status as keyof typeof STOREFRONT_STRINGS.account.orders.paymentStates
  ] || status;
}

function getOrderStatusLabel(order: CustomerOrder) {
  if (order.paymentStatus === "payment_failed") return getPaymentStatusLabel(order.paymentStatus);
  return getStateLabel(order.fulfillmentStatus || order.status);
}

function canCancelItem(item: CustomerOrderItem, order: CustomerOrder) {
  if (order.paymentStatus === "payment_failed") return false;
  const status = String(item.fulfillmentStatus || "").toLowerCase();
  return (status === "processing" || status === "packed") && !item.cancelRequestedAt;
}

function canReturnItem(item: CustomerOrderItem, order: CustomerOrder) {
  if (order.paymentStatus === "payment_failed") return false;
  return item.returnEligible === true;
}

function formatDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
}

function getItemActionNote(item: CustomerOrderItem, order: CustomerOrder) {
  if (order.paymentStatus === "payment_failed") {
    return STOREFRONT_STRINGS.checkout.failureSubtitle;
  }
  const status = String(item.fulfillmentStatus || "").toLowerCase();
  if (status === "packed" && item.cancelRequestedAt) return STOREFRONT_STRINGS.account.orders.cancellationRequestedNote;
  if (status === "packed") return STOREFRONT_STRINGS.account.orders.cancelBlockedPacked;
  if (status === "shipped") return STOREFRONT_STRINGS.account.orders.cancelBlockedShipped;
  if (status === "delivered" && item.returnEligible === false) {
    if (item.returnEligibilityReason === "expired") return STOREFRONT_STRINGS.account.orders.returnBlockedExpired;
    if (item.returnEligibilityReason === "non_returnable") return STOREFRONT_STRINGS.account.orders.returnBlockedNonReturnable;
  }
  return "";
}

export default function OrdersPage() {
  const router = useRouter();
  const { ready, customer, accessToken } = useAccount();
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [statusTone, setStatusTone] = useState<"neutral" | "error">("neutral");
  const [actionBusyKey, setActionBusyKey] = useState("");

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) || orders[0] || null,
    [orders, selectedOrderId]
  );

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
        const nextOrders = payload.orders || [];
        setOrders(nextOrders);
        setSelectedOrderId((current) => current && nextOrders.some((order) => order.id === current) ? current : nextOrders[0]?.id || "");
        setError("");
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
    try {
      const payload = await fetchCustomerOrder(accessToken, orderId);
      const nextOrder = payload.order;
      setOrders((current) => {
        const next = current.map((order) => order.id === nextOrder.id ? nextOrder : order);
        return next.some((order) => order.id === nextOrder.id) ? next : [nextOrder, ...next];
      });
      setSelectedOrderId(orderId);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : STOREFRONT_STRINGS.account.orders.fallbackError);
    }
  };

  const updateOrder = (nextOrder: CustomerOrder) => {
    setOrders((current) => current.map((order) => order.id === nextOrder.id ? nextOrder : order));
    setSelectedOrderId(nextOrder.id);
  };

  const handleItemCancel = async (orderId: string, itemId: string) => {
    if (!accessToken || actionBusyKey) return;
    const item = selectedOrder?.items.find((entry) => entry.id === itemId);
    const wasPacked = String(item?.fulfillmentStatus || "").toLowerCase() === "packed";
    setActionBusyKey(`${itemId}:cancel`);
    setStatusMessage("");
    try {
      const payload = await cancelCustomerOrderItem(accessToken, orderId, itemId);
      updateOrder(payload.order);
      setStatusMessage(
        wasPacked
          ? STOREFRONT_STRINGS.account.orders.cancelRequestedSuccess
          : STOREFRONT_STRINGS.account.orders.cancelSuccess
      );
      setStatusTone("neutral");
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : STOREFRONT_STRINGS.account.orders.cancelFailed);
      setStatusTone("error");
    } finally {
      setActionBusyKey("");
    }
  };

  const handleItemReturn = async (orderId: string, itemId: string) => {
    if (!accessToken || actionBusyKey) return;
    setActionBusyKey(`${itemId}:return`);
    setStatusMessage("");
    try {
      const payload = await requestCustomerOrderItemReturn(accessToken, orderId, itemId);
      updateOrder(payload.order);
      setStatusMessage(STOREFRONT_STRINGS.account.orders.returnSuccess);
      setStatusTone("neutral");
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : STOREFRONT_STRINGS.account.orders.returnFailed);
      setStatusTone("error");
    } finally {
      setActionBusyKey("");
    }
  };

  return (
    <AccountShell title={STOREFRONT_STRINGS.account.orders.title} subtitle={STOREFRONT_STRINGS.account.orders.subtitle}>
      {error ? <div className="status-banner status-banner--error">{error}</div> : null}
      {statusMessage ? <div className={`status-banner ${statusTone === "error" ? "status-banner--error" : ""}`}>{statusMessage}</div> : null}
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
                <span>{formatDate(order.placedAt)}</span>
                <span>{getOrderStatusLabel(order)}</span>
                <span>{formatMoney(getOrderDisplayTotal(order))}</span>
              </button>
            ))}
          </div>

          <div className="account-orders__detail">
            {selectedOrder ? (
              <>
                <div className="account-orders__detail-header">
                  <div>
                    <h3>{STOREFRONT_STRINGS.account.orders.orderPrefix}{selectedOrder.id.slice(-6).toUpperCase()}</h3>
                    <p className="section-copy">{STOREFRONT_STRINGS.account.orders.status}: {getOrderStatusLabel(selectedOrder)}</p>
                    <p className="section-copy">{STOREFRONT_STRINGS.account.orders.paymentStatus}: {getPaymentStatusLabel(selectedOrder.paymentStatus)}</p>
                    <p className="section-copy">{STOREFRONT_STRINGS.account.orders.fulfillmentStatus}: {getStateLabel(selectedOrder.fulfillmentStatus)}</p>
                  </div>
                  <strong>{formatMoney(getOrderDisplayTotal(selectedOrder))}</strong>
                </div>

                {selectedOrder.addressSnapshot ? (
                  <div className="account-orders__address section-copy">
                    {selectedOrder.addressSnapshot.fullName}
                    <br />
                    {selectedOrder.addressSnapshot.line1}
                    {selectedOrder.addressSnapshot.line2 ? `, ${selectedOrder.addressSnapshot.line2}` : ""}
                    <br />
                    {selectedOrder.addressSnapshot.city}, {selectedOrder.addressSnapshot.state} {selectedOrder.addressSnapshot.postalCode}
                    <br />
                    {selectedOrder.addressSnapshot.country}
                  </div>
                ) : null}

                <p className="section-copy">{STOREFRONT_STRINGS.account.orders.supportNote}</p>

                <div className="account-orders__lines">
                  {selectedOrder.items.map((item, index) => {
                    const actionNote = getItemActionNote(item, selectedOrder);
                    const canCancel = canCancelItem(item, selectedOrder);
                    const canReturn = canReturnItem(item, selectedOrder);

                    return (
                      <article key={item.id || `${item.slug || item.title}-${index}`} className="account-orders__line account-orders__line-card">
                        <div className="account-orders__line-main">
                          <div className="account-orders__line-header">
                            <div>
                              <strong>{item.title}</strong>
                              <div className="section-copy">{STOREFRONT_STRINGS.account.orders.qty} {item.quantity}</div>
                            </div>
                            <strong>{formatMoney(getItemDisplayTotal(item))}</strong>
                          </div>

                          <div className="account-orders__line-meta">
                            <span>{STOREFRONT_STRINGS.account.orders.lifecycle}: {getStateLabel(item.fulfillmentStatus)}</span>
                            {item.cancelRequestedAt ? (
                              <span>{STOREFRONT_STRINGS.account.orders.cancellationRequested}</span>
                            ) : null}
                            {item.stockKey ? <span>{STOREFRONT_STRINGS.product.stockKeyLabel}: {item.stockKey}</span> : null}
                            {item.outboundTrackingNumber ? (
                              <span>{STOREFRONT_STRINGS.account.orders.outboundTracking}: {item.outboundTrackingNumber}</span>
                            ) : null}
                            {item.collectionTrackingNumber ? (
                              <span>{STOREFRONT_STRINGS.account.orders.collectionTracking}: {item.collectionTrackingNumber}</span>
                            ) : null}
                            {item.deliveredAt ? (
                              <span>{STOREFRONT_STRINGS.account.orders.deliveredAt}: {formatDate(item.deliveredAt)}</span>
                            ) : null}
                          </div>

                          {actionNote ? <p className="section-copy">{actionNote}</p> : null}
                        </div>

                        <div className="account-orders__line-actions">
                          {canCancel ? (
                            <button
                              type="button"
                              className="secondary-button"
                              disabled={actionBusyKey === `${item.id}:cancel`}
                              onClick={() => handleItemCancel(selectedOrder.id, item.id)}
                            >
                              {actionBusyKey === `${item.id}:cancel`
                                ? STOREFRONT_STRINGS.account.orders.cancelBusy
                                : STOREFRONT_STRINGS.account.orders.cancel}
                            </button>
                          ) : null}

                          {canReturn ? (
                            <button
                              type="button"
                              className="secondary-button"
                              disabled={actionBusyKey === `${item.id}:return`}
                              onClick={() => handleItemReturn(selectedOrder.id, item.id)}
                            >
                              {actionBusyKey === `${item.id}:return`
                                ? STOREFRONT_STRINGS.account.orders.returnBusy
                                : STOREFRONT_STRINGS.account.orders.return}
                            </button>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </AccountShell>
  );
}
