"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AccountShell } from "@/components/AccountShell";
import { useAccount } from "@/components/AccountProvider";
import {
  cancelCustomerOrderItem,
  fetchCustomerOrder,
  fetchCustomerOrders,
  requestCustomerOrderItemExchange,
  requestCustomerOrderItemReturn,
  type CustomerOrder,
  type CustomerOrderItem,
} from "@/lib/accountApi";
import { formatMoney } from "@/lib/pricing";
import { STOREFRONT_STRINGS } from "@/lib/strings";

type RequestKind = "RETURN" | "EXCHANGE";

type RequestFormState = {
  activeKind: RequestKind | "";
  reason: string;
  phoneNumber: string;
  whatsappNumber: string;
};

function getOrderDisplayTotal(order: CustomerOrder) {
  return Number(order.grandTotal ?? order.total ?? 0);
}

function getItemDisplayTotal(item: CustomerOrderItem) {
  return Number(item.lineGrandTotal ?? item.lineTotal ?? 0);
}

function getStateLabel(status?: string) {
  if (!status) return STOREFRONT_STRINGS.account.orders.states.PLACED;
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

function getReturnExchangeStatusLabel(status?: string) {
  if (!status) return "-";
  return STOREFRONT_STRINGS.account.orders.returnExchangeStates[
    status as keyof typeof STOREFRONT_STRINGS.account.orders.returnExchangeStates
  ] || status;
}

function canCancelItem(item: CustomerOrderItem, order: CustomerOrder) {
  if (order.paymentStatus === "payment_failed") return false;
  const status = String(item.fulfillmentStatus || "").toUpperCase();
  return [
    "RESERVED",
    "PICKED_FROM_WAREHOUSE",
    "HANDED_TO_PACKAGING",
    "PACKAGING_RECEIVED",
    "PACKAGING_IN_PROGRESS",
    "PACKED",
    "HANDED_TO_SHIPPING",
    "SHIPPING_RECEIVED",
    "SHIPPING_IN_PROGRESS",
  ].includes(status) && !item.cancelRequestedAt;
}

function canOpenReturnExchange(item: CustomerOrderItem) {
  return !!item.canRequestReturn && !!item.canRequestExchange && !item.returnExchangeCase;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
}

function getItemActionNote(item: CustomerOrderItem, order: CustomerOrder) {
  if (order.paymentStatus === "payment_failed") {
    return STOREFRONT_STRINGS.checkout.failureSubtitle;
  }
  const status = String(item.fulfillmentStatus || "").toUpperCase();
  if (["CANCEL_REQUESTED", "HANDED_TO_CANCELLATION", "CANCELLATION_RECEIVED"].includes(status)) {
    return STOREFRONT_STRINGS.account.orders.cancellationReceiptPendingNote;
  }
  if ((status === "PACKED" || status === "SHIPPING_RECEIVED" || status === "SHIPPING_IN_PROGRESS") && item.cancelRequestedAt) {
    return STOREFRONT_STRINGS.account.orders.cancellationRequestedNote;
  }
  if (["CANCEL_RESTOCKED", "CANCEL_DAMAGED", "CANCEL_LOST", "CANCEL_CLOSED", "CANCELLED_BEFORE_PICKING"].includes(status)) {
    return STOREFRONT_STRINGS.account.orders.inventoryAcceptanceCancelNote;
  }
  if (status === "SHIPPED") return STOREFRONT_STRINGS.account.orders.cancelBlockedShipped;
  return "";
}

function getReturnExchangeBlockMessage(item: CustomerOrderItem) {
  if (item.returnExchangeCase) {
    return STOREFRONT_STRINGS.account.orders.returnBlockedCaseExists;
  }
  switch (String(item.returnExchangeBlockReason || "").trim()) {
    case "not_delivered":
      return STOREFRONT_STRINGS.account.orders.returnBlockedPendingDelivery;
    case "non_returnable":
      return STOREFRONT_STRINGS.account.orders.returnBlockedNonReturnable;
    case "expired":
      return STOREFRONT_STRINGS.account.orders.returnBlockedExpired;
    case "case_exists":
      return STOREFRONT_STRINGS.account.orders.returnBlockedCaseExists;
    default:
      return "";
  }
}

const EMPTY_FORM: RequestFormState = {
  activeKind: "",
  reason: "",
  phoneNumber: "",
  whatsappNumber: "",
};

export default function OrdersPage() {
  const router = useRouter();
  const { ready, customer, accessToken } = useAccount();
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [statusTone, setStatusTone] = useState<"neutral" | "error">("neutral");
  const [actionBusyKey, setActionBusyKey] = useState("");
  const [requestForms, setRequestForms] = useState<Record<string, RequestFormState>>({});

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
    void load();
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

  const updateRequestForm = (itemId: string, next: Partial<RequestFormState>) => {
    setRequestForms((current) => ({
      ...current,
      [itemId]: {
        ...(current[itemId] || EMPTY_FORM),
        ...next,
      },
    }));
  };

  const closeRequestForm = (itemId: string) => {
    setRequestForms((current) => ({
      ...current,
      [itemId]: EMPTY_FORM,
    }));
  };

  const handleItemCancel = async (orderId: string, itemId: string) => {
    if (!accessToken || actionBusyKey) return;
    const item = selectedOrder?.items.find((entry) => entry.id === itemId);
    const wasQueuedCancellation = [
      "PICKED_FROM_WAREHOUSE",
      "HANDED_TO_PACKAGING",
      "PACKAGING_RECEIVED",
      "PACKAGING_IN_PROGRESS",
      "PACKED",
      "HANDED_TO_SHIPPING",
      "SHIPPING_RECEIVED",
      "SHIPPING_IN_PROGRESS",
    ].includes(String(item?.fulfillmentStatus || "").toUpperCase());
    setActionBusyKey(`${itemId}:cancel`);
    setStatusMessage("");
    try {
      const payload = await cancelCustomerOrderItem(accessToken, orderId, itemId);
      updateOrder(payload.order);
      setStatusMessage(
        wasQueuedCancellation
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

  const handleReturnExchangeRequest = async (orderId: string, item: CustomerOrderItem, kind: RequestKind) => {
    if (!accessToken || actionBusyKey) return;
    const form = requestForms[item.id] || EMPTY_FORM;
    const busyKey = `${item.id}:${kind}`;
    setActionBusyKey(busyKey);
    setStatusMessage("");
    try {
      const payload = kind === "RETURN"
        ? await requestCustomerOrderItemReturn(accessToken, orderId, item.id, {
          reason: form.reason,
          phoneNumber: form.phoneNumber,
          whatsappNumber: form.whatsappNumber,
        })
        : await requestCustomerOrderItemExchange(accessToken, orderId, item.id, {
          reason: form.reason,
          phoneNumber: form.phoneNumber,
          whatsappNumber: form.whatsappNumber,
        });
      updateOrder(payload.order);
      closeRequestForm(item.id);
      setStatusMessage(
        kind === "RETURN"
          ? STOREFRONT_STRINGS.account.orders.returnSuccess
          : STOREFRONT_STRINGS.account.orders.exchangeSuccess
      );
      setStatusTone("neutral");
    } catch (err) {
      setStatusMessage(
        err instanceof Error
          ? err.message
          : (kind === "RETURN"
            ? STOREFRONT_STRINGS.account.orders.returnFailed
            : STOREFRONT_STRINGS.account.orders.exchangeFailed)
      );
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
                onClick={() => void loadOrder(order.id)}
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
                    const requestForm = requestForms[item.id] || EMPTY_FORM;
                    const activeRequestKind = requestForm.activeKind || null;
                    const blockMessage = getReturnExchangeBlockMessage(item);
                    const returnReceivedAt = item.returnExchangeCase?.receivedAt || item.returnReceivedAt || null;

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
                            {item.returnExchangeCase?.courierName ? (
                              <span>{STOREFRONT_STRINGS.account.orders.courier}: {item.returnExchangeCase.courierName}</span>
                            ) : null}
                            {item.returnExchangeCase?.returnTrackingNumber ? (
                              <span>{STOREFRONT_STRINGS.account.orders.returnTracking}: {item.returnExchangeCase.returnTrackingNumber}</span>
                            ) : null}
                            {returnReceivedAt ? (
                              <span>{STOREFRONT_STRINGS.account.orders.returnReceivedAt}: {formatDate(returnReceivedAt)}</span>
                            ) : null}
                            {!item.returnExchangeCase && item.deliveredAt ? (
                              <span>{STOREFRONT_STRINGS.account.orders.deliveredAt}: {formatDate(item.deliveredAt)}</span>
                            ) : null}
                          </div>

                          {actionNote ? <p className="section-copy">{actionNote}</p> : null}
                          {item.returnExchangeCase ? (
                            <div className="section-copy">
                              {STOREFRONT_STRINGS.account.orders.activeCaseLabel}: {getReturnExchangeStatusLabel(item.returnExchangeCase.status)}
                            </div>
                          ) : null}
                          {!item.returnExchangeCase && blockMessage && !canOpenReturnExchange(item) ? (
                            <p className="section-copy">{blockMessage}</p>
                          ) : null}

                          {activeRequestKind ? (
                            <div className="account-orders__request-form">
                              <label className="account-orders__request-field">
                                <span>
                                  {activeRequestKind === "RETURN"
                                    ? STOREFRONT_STRINGS.account.orders.returnReasonLabel
                                    : STOREFRONT_STRINGS.account.orders.exchangeReasonLabel}
                                </span>
                                <textarea
                                  className="account-orders__request-textarea"
                                  rows={3}
                                  value={requestForm.reason}
                                  onChange={(event) => updateRequestForm(item.id, { reason: event.target.value })}
                                />
                              </label>
                              <label className="account-orders__request-field">
                                <span>{STOREFRONT_STRINGS.account.orders.phoneNumberLabel}</span>
                                <input
                                  value={requestForm.phoneNumber}
                                  onChange={(event) => updateRequestForm(item.id, { phoneNumber: event.target.value })}
                                />
                              </label>
                              <label className="account-orders__request-field">
                                <span>{STOREFRONT_STRINGS.account.orders.whatsappNumberLabel}</span>
                                <input
                                  value={requestForm.whatsappNumber}
                                  onChange={(event) => updateRequestForm(item.id, { whatsappNumber: event.target.value })}
                                />
                              </label>
                              <p className="section-copy">{STOREFRONT_STRINGS.account.orders.contactHint}</p>
                              <div className="account-orders__request-actions">
                                <button
                                  type="button"
                                  className="secondary-button"
                                  disabled={actionBusyKey === `${item.id}:${activeRequestKind}`}
                                  onClick={() => void handleReturnExchangeRequest(selectedOrder.id, item, activeRequestKind)}
                                >
                                  {actionBusyKey === `${item.id}:${activeRequestKind}`
                                    ? (activeRequestKind === "RETURN"
                                      ? STOREFRONT_STRINGS.account.orders.returnBusy
                                      : STOREFRONT_STRINGS.account.orders.exchangeBusy)
                                    : (activeRequestKind === "RETURN"
                                      ? STOREFRONT_STRINGS.account.orders.submitReturn
                                      : STOREFRONT_STRINGS.account.orders.submitExchange)}
                                </button>
                                <button
                                  type="button"
                                  className="secondary-button"
                                  onClick={() => closeRequestForm(item.id)}
                                >
                                  {STOREFRONT_STRINGS.account.addresses.actions.cancel}
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </div>

                        <div className="account-orders__line-actions">
                          {canCancel ? (
                            <button
                              type="button"
                              className="secondary-button"
                              disabled={actionBusyKey === `${item.id}:cancel`}
                              onClick={() => void handleItemCancel(selectedOrder.id, item.id)}
                            >
                              {actionBusyKey === `${item.id}:cancel`
                                ? STOREFRONT_STRINGS.account.orders.cancelBusy
                                : STOREFRONT_STRINGS.account.orders.cancel}
                            </button>
                          ) : null}
                          {canOpenReturnExchange(item) && !activeRequestKind ? (
                            <>
                              <button
                                type="button"
                                className="secondary-button"
                                onClick={() => updateRequestForm(item.id, { activeKind: "RETURN" })}
                              >
                                {STOREFRONT_STRINGS.account.orders.return}
                              </button>
                              <button
                                type="button"
                                className="secondary-button"
                                onClick={() => updateRequestForm(item.id, { activeKind: "EXCHANGE" })}
                              >
                                {STOREFRONT_STRINGS.account.orders.exchange}
                              </button>
                            </>
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
