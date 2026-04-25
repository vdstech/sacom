"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ProtectedPage } from "@/components/ProtectedPage";
import { PaginationControls } from "@/components/PaginationControls";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/api";
import { ADMIN_UI_STRINGS } from "@/lib/uiStrings";

const PAGE_SIZE = 25;

type OrderItemDoc = {
  id: string;
  title: string;
  slug?: string;
  stockKey?: string;
  quantity: number;
  fulfillmentStatus?: string;
  cancelRequestedAt?: string | null;
  shippedAt?: string | null;
  deliveredAt?: string | null;
  adminCancelledAt?: string | null;
  outboundTrackingNumber?: string;
  collectionTrackingNumber?: string;
  lineGrandTotal?: number;
  lineTotal?: number;
};

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

type OrderDoc = {
  id: string;
  placedAt?: string;
  status: string;
  paymentStatus?: string;
  fulfillmentStatus?: string;
  itemCount: number;
  grandTotal?: number;
  total: number;
  paymentReference?: string;
  addressSnapshot?: AddressSnapshot | null;
  items: OrderItemDoc[];
};

type PaginatedResponse<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

type OrdersWorkspaceProps = {
  title?: string;
  subtitle?: string;
  lockedFulfillmentStatus?: string;
  lockedPaymentStatus?: string;
  backHref?: string;
  backLabel?: string;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function statusLabel(status?: string) {
  if (!status) return ADMIN_UI_STRINGS.orders.states.processing;
  return ADMIN_UI_STRINGS.orders.states[status as keyof typeof ADMIN_UI_STRINGS.orders.states] || status;
}

function paymentLabel(status?: string) {
  if (!status) return ADMIN_UI_STRINGS.orders.paymentStates.paid;
  return ADMIN_UI_STRINGS.orders.paymentStates[
    status as keyof typeof ADMIN_UI_STRINGS.orders.paymentStates
  ] || status;
}

function orderListLabel(order: OrderDoc) {
  if (order.paymentStatus === "payment_failed") return paymentLabel(order.paymentStatus);
  return statusLabel(order.fulfillmentStatus);
}

function getOrderAmount(order: OrderDoc) {
  return Number(order.grandTotal ?? order.total ?? 0);
}

function getItemAmount(item: OrderItemDoc) {
  return Number(item.lineGrandTotal ?? item.lineTotal ?? 0);
}

function joinAddress(address?: AddressSnapshot | null) {
  if (!address) return [];
  return [
    address.fullName,
    [address.line1, address.line2].filter(Boolean).join(", "),
    [address.city, address.state, address.postalCode].filter(Boolean).join(", "),
    address.country,
    address.phone,
  ].filter(Boolean) as string[];
}

export function OrdersWorkspace({
  title = ADMIN_UI_STRINGS.orders.title,
  subtitle = ADMIN_UI_STRINGS.orders.detailTitle,
  lockedFulfillmentStatus = "",
  lockedPaymentStatus = "",
  backHref = "/admin/orders/dashboard",
  backLabel = ADMIN_UI_STRINGS.menu.ordersDashboard,
}: OrdersWorkspaceProps) {
  const { accessToken, refreshAccessToken } = useAuth();
  const [orders, setOrders] = useState<OrderDoc[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [stockKeyInput, setStockKeyInput] = useState("");
  const [stockKey, setStockKey] = useState("");
  const [selectedState, setSelectedState] = useState(lockedFulfillmentStatus);
  const [selectedPaymentState, setSelectedPaymentState] = useState(lockedPaymentStatus);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionBusyKey, setActionBusyKey] = useState("");
  const [outboundDrafts, setOutboundDrafts] = useState<Record<string, string>>({});
  const [collectionDrafts, setCollectionDrafts] = useState<Record<string, string>>({});

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) || orders[0] || null,
    [orders, selectedOrderId]
  );

  const load = async (preferredOrderId = "") => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (stockKey) params.set("stockKey", stockKey);
      if (selectedState) params.set("fulfillmentStatus", selectedState);
      if (selectedPaymentState) params.set("paymentStatus", selectedPaymentState);
      params.set("page", String(page));
      params.set("limit", String(PAGE_SIZE));

      const payload = await apiRequest<PaginatedResponse<OrderDoc>>(
        `/api/admin/orders${params.toString() ? `?${params.toString()}` : ""}`,
        {
          token: accessToken,
          onUnauthorized: refreshAccessToken,
        }
      );

      const nextOrders = payload?.items || [];
      setOrders(nextOrders);
      setTotal(Number(payload?.total || 0));
      setTotalPages(Math.max(1, Number(payload?.totalPages || 1)));
      setError("");
      setActionError("");
      setSelectedOrderId((current) => {
        const candidate = preferredOrderId || current;
        if (candidate && nextOrders.some((order) => order.id === candidate)) return candidate;
        return nextOrders[0]?.id || "";
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadOrder = async (orderId: string) => {
    setSelectedOrderId(orderId);
    try {
      const payload = await apiRequest<{ order: OrderDoc }>(`/api/admin/orders/${encodeURIComponent(orderId)}`, {
        token: accessToken,
        onUnauthorized: refreshAccessToken,
      });
      const nextOrder = payload.order;
      setOrders((current) => {
        const next = current.map((order) => order.id === nextOrder.id ? nextOrder : order);
        return next.some((order) => order.id === nextOrder.id) ? next : [nextOrder, ...next];
      });
      setActionError("");
    } catch (err) {
      setActionError((err as Error).message);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextSearch = params.get("orderId") || "";
    const nextStockKey = (params.get("stockKey") || "").toUpperCase();
    const nextState = lockedFulfillmentStatus || params.get("fulfillmentStatus") || "";
    const nextPaymentState = lockedPaymentStatus || params.get("paymentStatus") || "";

    setSearchInput(nextSearch);
    setSearch(nextSearch);
    setStockKeyInput(nextStockKey);
    setStockKey(nextStockKey);
    setSelectedState(nextState);
    setSelectedPaymentState(nextPaymentState);
  }, [lockedFulfillmentStatus, lockedPaymentStatus]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextSearch = searchInput.trim();
      const nextStockKey = stockKeyInput.trim().toUpperCase();
      setSearch((current) => current === nextSearch ? current : nextSearch);
      setStockKey((current) => current === nextStockKey ? current : nextStockKey);
      setPage(1);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [searchInput, stockKeyInput]);

  useEffect(() => {
    load();
  }, [search, stockKey, selectedState, selectedPaymentState, page]);

  useEffect(() => {
    if (!selectedOrder) return;
    setOutboundDrafts((current) => {
      const next = { ...current };
      for (const item of selectedOrder.items || []) {
        if (item.outboundTrackingNumber && !next[item.id]) next[item.id] = item.outboundTrackingNumber;
      }
      return next;
    });
    setCollectionDrafts((current) => {
      const next = { ...current };
      for (const item of selectedOrder.items || []) {
        if (item.collectionTrackingNumber && !next[item.id]) next[item.id] = item.collectionTrackingNumber;
      }
      return next;
    });
  }, [selectedOrder]);

  const setOrderFromPayload = (nextOrder: OrderDoc) => {
    setOrders((current) => current.map((order) => order.id === nextOrder.id ? nextOrder : order));
    setSelectedOrderId(nextOrder.id);
    setActionError("");
  };

  const submitLifecycleAction = async ({
    method,
    path,
    body,
    busyKey,
  }: {
    method: "POST" | "PATCH";
    path: string;
    body?: unknown;
    busyKey: string;
  }) => {
    setActionBusyKey(busyKey);
    setActionError("");
    try {
      const payload = await apiRequest<{ order: OrderDoc }>(path, {
        method,
        body,
        token: accessToken,
        onUnauthorized: refreshAccessToken,
      });
      setOrderFromPayload(payload.order);
      await load(payload.order.id);
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setActionBusyKey("");
    }
  };

  const handlePack = async (orderId: string, itemId: string) => {
    await submitLifecycleAction({
      method: "PATCH",
      path: `/api/admin/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(itemId)}`,
      body: { fulfillmentStatus: "packed" },
      busyKey: `${itemId}:pack`,
    });
  };

  const handleProcessingCancel = async (orderId: string, itemId: string) => {
    if (!window.confirm(ADMIN_UI_STRINGS.orders.cancelConfirm)) return;
    await submitLifecycleAction({
      method: "POST",
      path: `/api/admin/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(itemId)}/cancel`,
      busyKey: `${itemId}:cancel`,
    });
  };

  const handleUnpackCancel = async (orderId: string, itemId: string) => {
    if (!window.confirm(ADMIN_UI_STRINGS.orders.unpackConfirm)) return;
    await submitLifecycleAction({
      method: "POST",
      path: `/api/admin/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(itemId)}/unpack-cancel`,
      busyKey: `${itemId}:unpack-cancel`,
    });
  };

  const handleShip = async (orderId: string, itemId: string) => {
    const tracking = String(outboundDrafts[itemId] || "").trim();
    if (!tracking) {
      setActionError(ADMIN_UI_STRINGS.orders.outboundTrackingRequired);
      return;
    }
    await submitLifecycleAction({
      method: "PATCH",
      path: `/api/admin/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(itemId)}`,
      body: {
        fulfillmentStatus: "shipped",
        outboundTrackingNumber: tracking,
      },
      busyKey: `${itemId}:ship`,
    });
  };

  const handleCollectionSchedule = async (orderId: string, itemId: string) => {
    const tracking = String(collectionDrafts[itemId] || "").trim();
    if (!tracking) {
      setActionError(ADMIN_UI_STRINGS.orders.collectionTrackingRequired);
      return;
    }
    await submitLifecycleAction({
      method: "PATCH",
      path: `/api/admin/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(itemId)}`,
      body: {
        fulfillmentStatus: "collection_scheduled",
        collectionTrackingNumber: tracking,
      },
      busyKey: `${itemId}:collection`,
    });
  };

  const handleSimpleTransition = async (
    orderId: string,
    itemId: string,
    nextStatus: "return_in_transit" | "return_received" | "refund_completed"
  ) => {
    await submitLifecycleAction({
      method: "PATCH",
      path: `/api/admin/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(itemId)}`,
      body: { fulfillmentStatus: nextStatus },
      busyKey: `${itemId}:${nextStatus}`,
    });
  };

  return (
    <ProtectedPage anyOf={["order:read", "order:write", "order:delete"]}>
      <section className="card orders-toolbar orders-toolbar--headline">
        <div>
          <div className="orders-detail__eyebrow">{title}</div>
          <h1 style={{ margin: "6px 0 0" }}>{subtitle}</h1>
        </div>
        <div className="row">
          <Link href={backHref}><button className="secondary">{backLabel}</button></Link>
          <Link href="/admin/orders/metrics"><button className="secondary">{ADMIN_UI_STRINGS.menu.ordersMetrics}</button></Link>
          <button className="secondary" onClick={() => load(selectedOrderId)}>{ADMIN_UI_STRINGS.common.refresh}</button>
        </div>
      </section>

      <section className="card orders-toolbar">
        <div style={{ minWidth: 220, flex: "1 1 260px" }}>
          <label>
            {ADMIN_UI_STRINGS.orders.searchLabel}
            <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Order id, name, title, tracking" />
          </label>
        </div>
        <div style={{ minWidth: 180 }}>
          <label>
            {ADMIN_UI_STRINGS.orders.stockKeyLabel}
            <input value={stockKeyInput} onChange={(event) => setStockKeyInput(event.target.value)} placeholder="STK-..." />
          </label>
        </div>
        {!lockedFulfillmentStatus ? (
          <div style={{ minWidth: 180 }}>
            <label>
              {ADMIN_UI_STRINGS.orders.stateLabel}
              <select
                value={selectedState}
                onChange={(event) => {
                  setSelectedState(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">{ADMIN_UI_STRINGS.orders.allStates}</option>
                {Object.entries(ADMIN_UI_STRINGS.orders.states).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
        {!lockedPaymentStatus ? (
          <div style={{ minWidth: 180 }}>
            <label>
              {ADMIN_UI_STRINGS.orders.paymentStateLabel}
              <select
                value={selectedPaymentState}
                onChange={(event) => {
                  setSelectedPaymentState(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">{ADMIN_UI_STRINGS.orders.allPayments}</option>
                {Object.entries(ADMIN_UI_STRINGS.orders.paymentStates).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
      </section>

      {error ? <div className="error">{error}</div> : null}
      {actionError ? <div className="error">{actionError}</div> : null}
      {loading ? <div>{ADMIN_UI_STRINGS.common.loadingOrders}</div> : null}

      <section className="orders-layout">
        <div className="orders-list">
          {orders.map((order) => (
            <button
              key={order.id}
              type="button"
              className={`card orders-list__item ${selectedOrder?.id === order.id ? "is-active" : ""}`}
              onClick={() => loadOrder(order.id)}
            >
              <strong>#{order.id.slice(-6).toUpperCase()}</strong>
              <span>{formatDate(order.placedAt)}</span>
              <span>{order.itemCount} items</span>
              <span>{orderListLabel(order)}</span>
              <span>{formatCurrency(getOrderAmount(order))}</span>
            </button>
          ))}
          {!orders.length && !loading ? <div className="card">No orders match the current filters.</div> : null}
        </div>

        <div className="orders-detail">
          {selectedOrder ? (
            <section className="card orders-detail__panel">
              <div className="orders-detail__header">
                <div>
                  <div className="orders-detail__eyebrow">{ADMIN_UI_STRINGS.orders.detailTitle}</div>
                  <h1 style={{ margin: "6px 0 0" }}>#{selectedOrder.id}</h1>
                  <div className="orders-detail__summary">
                    <span className="badge">{ADMIN_UI_STRINGS.orders.orderStatusPrefix}: {statusLabel(selectedOrder.fulfillmentStatus)}</span>
                    <span className="badge">{ADMIN_UI_STRINGS.orders.paymentStatusPrefix}: {paymentLabel(selectedOrder.paymentStatus)}</span>
                    {selectedOrder.paymentReference ? <span className="badge">Ref: {selectedOrder.paymentReference}</span> : null}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div>{formatDate(selectedOrder.placedAt)}</div>
                  <strong>{formatCurrency(getOrderAmount(selectedOrder))}</strong>
                </div>
              </div>

              {selectedOrder.paymentStatus === "payment_failed" ? (
                <div className="orders-item-card__flag orders-item-card__flag--alert">
                  <strong>{paymentLabel(selectedOrder.paymentStatus)}</strong>
                  <span>{ADMIN_UI_STRINGS.orders.failedPaymentBlocked}</span>
                </div>
              ) : null}

              {selectedOrder.addressSnapshot ? (
                <div className="orders-address">
                  {joinAddress(selectedOrder.addressSnapshot).map((line) => (
                    <span key={line}>{line}</span>
                  ))}
                </div>
              ) : null}

              <div className="orders-items">
                {selectedOrder.items.map((item) => {
                  const outboundValue = outboundDrafts[item.id] ?? item.outboundTrackingNumber ?? "";
                  const collectionValue = collectionDrafts[item.id] ?? item.collectionTrackingNumber ?? "";
                  const status = String(item.fulfillmentStatus || "processing");
                  const hasCancellationRequest = !!item.cancelRequestedAt;
                  const canAct = selectedOrder.paymentStatus !== "payment_failed";
                  const canPack = canAct && status === "processing";
                  const canCancel = canAct && status === "processing";
                  const canShip = canAct && status === "packed" && !hasCancellationRequest;
                  const canUnpackCancel = canAct && status === "packed" && hasCancellationRequest;
                  const canScheduleCollection = canAct && status === "return_requested";
                  const canMarkReturnInTransit = canAct && status === "collection_scheduled";
                  const canMarkReturnReceived = canAct && status === "return_in_transit";
                  const canMarkRefundCompleted = canAct && status === "return_received";

                  return (
                    <article key={item.id} className="orders-item-card">
                      <div style={{ flex: "1 1 auto" }}>
                        <div className="orders-item-card__title-row">
                          <div>
                            <strong>{item.title}</strong>
                            <div className="orders-item-card__meta">
                              {item.stockKey ? <span>{item.stockKey}</span> : null}
                              {item.slug ? <span>{item.slug}</span> : null}
                              <span>Qty {item.quantity}</span>
                              <span>{formatCurrency(getItemAmount(item))}</span>
                            </div>
                          </div>
                          <span className="badge">{statusLabel(status)}</span>
                        </div>

                        {hasCancellationRequest ? (
                          <div className="orders-item-card__flag orders-item-card__flag--alert">
                            <strong>{ADMIN_UI_STRINGS.orders.cancellationRequested}</strong>
                            <span>{ADMIN_UI_STRINGS.orders.cancellationRequestedHint}</span>
                          </div>
                        ) : null}

                        {item.outboundTrackingNumber ? (
                          <div className="orders-item-card__tracking">
                            <span>{ADMIN_UI_STRINGS.orders.outboundTrackingLabel}</span>
                            <strong>{item.outboundTrackingNumber}</strong>
                          </div>
                        ) : null}

                        {item.collectionTrackingNumber ? (
                          <div className="orders-item-card__tracking">
                            <span>{ADMIN_UI_STRINGS.orders.collectionTrackingLabel}</span>
                            <strong>{item.collectionTrackingNumber}</strong>
                          </div>
                        ) : null}

                        {item.deliveredAt ? (
                          <div className="orders-item-card__tracking">
                            <span>{ADMIN_UI_STRINGS.orders.states.delivered}</span>
                            <strong>{formatDate(item.deliveredAt)}</strong>
                          </div>
                        ) : null}

                        {item.adminCancelledAt ? (
                          <div className="orders-item-card__tracking">
                            <span>{ADMIN_UI_STRINGS.orders.states.cancelled_by_admin}</span>
                            <strong>{formatDate(item.adminCancelledAt)}</strong>
                          </div>
                        ) : null}
                      </div>

                      <div className="orders-item-card__control">
                        <div className="orders-item-card__actions-title">{ADMIN_UI_STRINGS.orders.nextActionsLabel}</div>
                        <div className="orders-item-card__actions">
                          {canPack ? (
                            <button
                              type="button"
                              className="secondary"
                              disabled={actionBusyKey === `${item.id}:pack`}
                              onClick={() => handlePack(selectedOrder.id, item.id)}
                            >
                              {ADMIN_UI_STRINGS.orders.packItem}
                            </button>
                          ) : null}

                          {canCancel ? (
                            <button
                              type="button"
                              className="danger"
                              disabled={actionBusyKey === `${item.id}:cancel`}
                              onClick={() => handleProcessingCancel(selectedOrder.id, item.id)}
                            >
                              {ADMIN_UI_STRINGS.orders.cancelItem}
                            </button>
                          ) : null}

                          {canShip ? (
                            <>
                              <input
                                value={outboundValue}
                                onChange={(event) => setOutboundDrafts((current) => ({ ...current, [item.id]: event.target.value }))}
                                placeholder={ADMIN_UI_STRINGS.orders.outboundTrackingLabel}
                              />
                              <button
                                type="button"
                                disabled={actionBusyKey === `${item.id}:ship`}
                                onClick={() => handleShip(selectedOrder.id, item.id)}
                              >
                                {ADMIN_UI_STRINGS.orders.shipItem}
                              </button>
                            </>
                          ) : null}

                          {canUnpackCancel ? (
                            <button
                              type="button"
                              className="danger"
                              disabled={actionBusyKey === `${item.id}:unpack-cancel`}
                              onClick={() => handleUnpackCancel(selectedOrder.id, item.id)}
                            >
                              {ADMIN_UI_STRINGS.orders.unpackCancelItem}
                            </button>
                          ) : null}

                          {canScheduleCollection ? (
                            <>
                              <input
                                value={collectionValue}
                                onChange={(event) => setCollectionDrafts((current) => ({ ...current, [item.id]: event.target.value }))}
                                placeholder={ADMIN_UI_STRINGS.orders.collectionTrackingLabel}
                              />
                              <button
                                type="button"
                                disabled={actionBusyKey === `${item.id}:collection`}
                                onClick={() => handleCollectionSchedule(selectedOrder.id, item.id)}
                              >
                                {ADMIN_UI_STRINGS.orders.requestCollection}
                              </button>
                            </>
                          ) : null}

                          {canMarkReturnInTransit ? (
                            <button
                              type="button"
                              className="secondary"
                              disabled={actionBusyKey === `${item.id}:return_in_transit`}
                              onClick={() => handleSimpleTransition(selectedOrder.id, item.id, "return_in_transit")}
                            >
                              {ADMIN_UI_STRINGS.orders.markReturnInTransit}
                            </button>
                          ) : null}

                          {canMarkReturnReceived ? (
                            <button
                              type="button"
                              className="secondary"
                              disabled={actionBusyKey === `${item.id}:return_received`}
                              onClick={() => handleSimpleTransition(selectedOrder.id, item.id, "return_received")}
                            >
                              {ADMIN_UI_STRINGS.orders.markReturnReceived}
                            </button>
                          ) : null}

                          {canMarkRefundCompleted ? (
                            <button
                              type="button"
                              className="secondary"
                              disabled={actionBusyKey === `${item.id}:refund_completed`}
                              onClick={() => handleSimpleTransition(selectedOrder.id, item.id, "refund_completed")}
                            >
                              {ADMIN_UI_STRINGS.orders.markRefundCompleted}
                            </button>
                          ) : null}

                          {!canPack &&
                          !canCancel &&
                          !canShip &&
                          !canUnpackCancel &&
                          !canScheduleCollection &&
                          !canMarkReturnInTransit &&
                          !canMarkReturnReceived &&
                          !canMarkRefundCompleted ? (
                            <span className="orders-item-card__actions-empty">No admin action available.</span>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : (
            <section className="card">Select an order to inspect its items.</section>
          )}
        </div>
      </section>

      <PaginationControls
        page={page}
        totalPages={totalPages}
        total={total}
        onPrevious={() => setPage((current) => Math.max(1, current - 1))}
        onNext={() => setPage((current) => Math.min(totalPages, current + 1))}
        previousLabel={ADMIN_UI_STRINGS.common.previous}
        nextLabel={ADMIN_UI_STRINGS.common.next}
      />
    </ProtectedPage>
  );
}
