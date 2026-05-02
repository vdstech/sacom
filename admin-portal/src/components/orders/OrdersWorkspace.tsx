"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ProtectedPage } from "@/components/ProtectedPage";
import { PaginationControls } from "@/components/PaginationControls";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/api";
import { ADMIN_UI_STRINGS } from "@/lib/uiStrings";

const PAGE_SIZE = 25;

type Lane = "processing" | "packaging" | "shipping" | "cancellations";

type PendingHandover = {
  type?: string;
  status?: string;
  fromOwner?: string;
  toOwner?: string;
  handedOverBy?: string;
  handedOverAt?: string | null;
  rejectionReason?: string;
} | null;

type OrderItemDoc = {
  id: string;
  title: string;
  slug?: string;
  stockKey?: string;
  quantity: number;
  fulfillmentStatus?: string;
  physicalOwner?: string;
  packageVerificationStatus?: string;
  labelStatus?: string;
  labelReprintCount?: number;
  labelReprintReason?: string;
  courierName?: string;
  outboundTrackingNumber?: string;
  cancellationSource?: string;
  cancellationReason?: string;
  cancelRequestedAt?: string | null;
  pickedAt?: string | null;
  handedToPackagingAt?: string | null;
  packagingReceivedAt?: string | null;
  packagingStartedAt?: string | null;
  packageVerifiedAt?: string | null;
  labelPrintedAt?: string | null;
  packedAt?: string | null;
  handedToShippingAt?: string | null;
  shippingReceivedAt?: string | null;
  shippingStartedAt?: string | null;
  trackingNumberEnteredAt?: string | null;
  shippedAt?: string | null;
  cancellationReceivedAt?: string | null;
  cancellationClosedAt?: string | null;
  lineGrandTotal?: number;
  lineTotal?: number;
  pendingHandover?: PendingHandover;
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
  title: string;
  subtitle: string;
  lane: Lane;
  backHref?: string;
  backLabel?: string;
  requiredAnyOf?: string[];
};

const LANE_ENDPOINTS: Record<Lane, string> = {
  processing: "/api/admin/orders/processing/picking-queue",
  packaging: "/api/admin/orders/packaging/receipt-queue",
  shipping: "/api/admin/orders/shipping/receipt-queue",
  cancellations: "/api/admin/orders/cancellations/pending",
};

const DEFAULT_REQUIRED: Record<Lane, string[]> = {
  processing: ["order:processing"],
  packaging: ["order:packaging"],
  shipping: ["order:shipping"],
  cancellations: ["order:cancellation"],
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function statusLabel(status?: string) {
  if (!status) return "-";
  return ADMIN_UI_STRINGS.orders.states[status as keyof typeof ADMIN_UI_STRINGS.orders.states] || status;
}

function paymentLabel(status?: string) {
  if (!status) return ADMIN_UI_STRINGS.orders.paymentStates.paid;
  return ADMIN_UI_STRINGS.orders.paymentStates[
    status as keyof typeof ADMIN_UI_STRINGS.orders.paymentStates
  ] || status;
}

function hasPermission(userPermissions: string[], permission: string) {
  return userPermissions.includes(permission);
}

function hasAnyPermission(userPermissions: string[], needed: string[]) {
  return needed.some((permission) => userPermissions.includes(permission));
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

function getLaneDescription(lane: Lane, item: OrderItemDoc) {
  const status = String(item.fulfillmentStatus || "").toUpperCase();
  const owner = String(item.physicalOwner || "").toUpperCase();
  const pendingType = String(item.pendingHandover?.type || "").toUpperCase();
  const pendingStatus = String(item.pendingHandover?.status || "").toUpperCase();

  if (lane === "processing") {
    if (status === "RESERVED") return "Ready to pick from warehouse.";
    if (status === "PICKED_FROM_WAREHOUSE") return "Picked and awaiting handover to packaging.";
    if (status === "HANDED_TO_PACKAGING" && pendingType === "PROCESSING_TO_PACKAGING") return "Waiting for packaging to confirm receipt.";
    if (status === "CANCEL_REQUESTED" && owner === "PROCESSING_MANAGER") {
      return "Customer cancellation requested. Processing owns the picked item and must hand it to the cancellation manager.";
    }
  }

  if (lane === "packaging") {
    if (status === "HANDED_TO_PACKAGING") return "Packaging can confirm or reject this handover.";
    if (status === "PACKAGING_RECEIVED") return "Ready to start packaging.";
    if (status === "PACKAGING_IN_PROGRESS") return "Verify the package, print label, and mark it packed.";
    if (status === "PACKED") return "Ready to hand over to shipping.";
    if (status === "HANDED_TO_SHIPPING" && pendingType === "PACKAGING_TO_SHIPPING") return "Waiting for shipping to confirm receipt.";
    if (status === "CANCEL_REQUESTED" && owner === "PACKAGING_MANAGER") {
      return pendingType === "PACKAGING_TO_SHIPPING" && pendingStatus === "REJECTED"
        ? "Shipping rejected receipt after cancellation. Packaging owns this item and must hand it to the cancellation manager."
        : "Customer cancellation requested. Packaging owns this item and must hand it to the cancellation manager.";
    }
  }

  if (lane === "shipping") {
    if (status === "HANDED_TO_SHIPPING") return "Shipping can confirm or reject this handover.";
    if (status === "SHIPPING_RECEIVED") return "Ready to start shipping.";
    if (status === "SHIPPING_IN_PROGRESS") return "Assign courier, enter tracking, and mark shipped.";
    if (status === "CANCEL_REQUESTED" && pendingType === "PACKAGING_TO_SHIPPING" && pendingStatus === "PENDING_RECEIPT") {
      return "Customer cancellation requested during shipping handover. Shipping must confirm or reject receipt first.";
    }
    if (status === "CANCEL_REQUESTED" && owner === "SHIPPING_OPERATOR") {
      return "Customer cancellation requested. Shipping received the item and must hand it to the cancellation manager.";
    }
  }

  if (lane === "cancellations") {
    if (status === "CANCEL_REQUESTED") return "Pending handover into the cancellation lane.";
    if (status === "HANDED_TO_CANCELLATION") return "Waiting for cancellation receipt confirmation.";
    if (status === "CANCELLATION_RECEIVED") return "Resolve the cancelled item as restocked, damaged, or lost.";
  }

  return "";
}

function getTimeline(item: OrderItemDoc) {
  const events = [
    ["Picked", item.pickedAt],
    ["Handed to packaging", item.handedToPackagingAt],
    ["Packaging received", item.packagingReceivedAt],
    ["Packaging started", item.packagingStartedAt],
    ["Package verified", item.packageVerifiedAt],
    ["Label printed", item.labelPrintedAt],
    ["Packed", item.packedAt],
    ["Handed to shipping", item.handedToShippingAt],
    ["Shipping received", item.shippingReceivedAt],
    ["Shipping started", item.shippingStartedAt],
    ["Tracking entered", item.trackingNumberEnteredAt],
    ["Shipped", item.shippedAt],
    ["Cancellation received", item.cancellationReceivedAt],
    ["Cancellation closed", item.cancellationClosedAt],
  ].filter(([, value]) => !!value);

  return events as Array<[string, string]>;
}

export function OrdersWorkspace({
  title,
  subtitle,
  lane,
  backHref = "/admin/orders/dashboard",
  backLabel = ADMIN_UI_STRINGS.orders.backToDashboard,
  requiredAnyOf,
}: OrdersWorkspaceProps) {
  const { accessToken, refreshAccessToken, me } = useAuth();
  const permissions = me?.permissions || [];
  const roleNames = (me?.roles || []).map((role) => String(role?.name || "").toUpperCase());
  const systemLevel = String(me?.systemLevel || me?.user?.systemLevel || "NONE").toUpperCase();
  const isSystemBypass = systemLevel === "SUPER" || systemLevel === "ADMIN";
  const [orders, setOrders] = useState<OrderDoc[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [stockKeyInput, setStockKeyInput] = useState("");
  const [stockKey, setStockKey] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionBusyKey, setActionBusyKey] = useState("");

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
      params.set("page", String(page));
      params.set("limit", String(PAGE_SIZE));

      const payload = await apiRequest<PaginatedResponse<OrderDoc>>(
        `${LANE_ENDPOINTS[lane]}${params.toString() ? `?${params.toString()}` : ""}`,
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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextSearch = searchInput.trim();
      const nextStockKey = stockKeyInput.trim().toUpperCase();
      setSearch((current) => current === nextSearch ? current : nextSearch);
      setStockKey((current) => current === nextStockKey ? current : nextStockKey);
      setPage(1);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [searchInput, stockKeyInput]);

  useEffect(() => {
    load();
  }, [lane, page, search, stockKey, accessToken]);

  const performAction = async (
    orderId: string,
    itemId: string,
    endpoint: string,
    body?: Record<string, unknown>,
    options?: { confirmMessage?: string; afterSuccess?: () => void }
  ) => {
    if (actionBusyKey) return;
    if (options?.confirmMessage && !window.confirm(options.confirmMessage)) return;

    setActionBusyKey(`${itemId}:${endpoint}`);
    setActionError("");
    try {
      await apiRequest<{ order: OrderDoc }>(endpoint, {
        method: "POST",
        token: accessToken,
        onUnauthorized: refreshAccessToken,
        body,
      });
      options?.afterSuccess?.();
      await load(orderId);
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setActionBusyKey("");
    }
  };

  const openLabelPreview = (orderId: string, itemId: string) => {
    window.open(`/admin/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(itemId)}/label`, "_blank", "noopener,noreferrer");
  };

  const required = requiredAnyOf || DEFAULT_REQUIRED[lane];

  return (
    <ProtectedPage anyOf={required}>
      <section className="card row" style={{ justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div className="orders-detail__eyebrow">{subtitle}</div>
          <h1 style={{ margin: "6px 0 0" }}>{title}</h1>
        </div>
        <div className="row">
          <Link href={backHref}><button className="secondary">{backLabel}</button></Link>
          <button className="secondary" onClick={() => load(selectedOrderId)}>{ADMIN_UI_STRINGS.common.refresh}</button>
        </div>
      </section>

      <section className="card row" style={{ gap: 12, alignItems: "end", flexWrap: "wrap" }}>
        <label style={{ minWidth: 220, flex: "1 1 220px" }}>
          {ADMIN_UI_STRINGS.orders.searchLabel}
          <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} />
        </label>
        <label style={{ minWidth: 220, flex: "1 1 220px" }}>
          {ADMIN_UI_STRINGS.orders.stockKeyLabel}
          <input value={stockKeyInput} onChange={(event) => setStockKeyInput(event.target.value)} />
        </label>
        <div className="section-copy">
          {ADMIN_UI_STRINGS.orders.summaryQueueCount}: {total}
        </div>
      </section>

      {error ? <div className="error">{error}</div> : null}
      {actionError ? <div className="error">{actionError}</div> : null}
      {loading ? <div>{ADMIN_UI_STRINGS.common.loadingOrders}</div> : null}

      {!loading && !orders.length ? (
        <section className="card">
          <p className="section-copy">{ADMIN_UI_STRINGS.orders.emptyQueue}</p>
        </section>
      ) : null}

      {orders.length ? (
        <div className="orders-layout">
          <aside className="orders-list">
            {orders.map((order) => (
              <button
                key={order.id}
                type="button"
                className={`orders-list__row ${selectedOrder?.id === order.id ? "is-active" : ""}`}
                onClick={() => setSelectedOrderId(order.id)}
              >
                <div>
                  <strong>#{order.id.slice(-6).toUpperCase()}</strong>
                  <div className="section-copy">{formatDate(order.placedAt)}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div>{statusLabel(order.fulfillmentStatus)}</div>
                  <div className="section-copy">{formatCurrency(getOrderAmount(order))}</div>
                </div>
              </button>
            ))}
          </aside>

          <section className="card orders-detail">
            {selectedOrder ? (
              <div style={{ display: "grid", gap: 20 }}>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "start", flexWrap: "wrap" }}>
                  <div>
                    <div className="orders-detail__eyebrow">{ADMIN_UI_STRINGS.orders.detailTitle}</div>
                    <h2 style={{ margin: "6px 0 0" }}>#{selectedOrder.id.slice(-6).toUpperCase()}</h2>
                    <div className="section-copy">
                      {ADMIN_UI_STRINGS.orders.orderStatusPrefix}: {statusLabel(selectedOrder.fulfillmentStatus)}
                    </div>
                    <div className="section-copy">
                      {ADMIN_UI_STRINGS.orders.paymentStatusPrefix}: {paymentLabel(selectedOrder.paymentStatus)}
                    </div>
                    <div className="section-copy">
                      {ADMIN_UI_STRINGS.orders.itemsInQueue}: {selectedOrder.items.length}
                    </div>
                  </div>
                  <strong>{formatCurrency(getOrderAmount(selectedOrder))}</strong>
                </div>

                {selectedOrder.addressSnapshot ? (
                  <div className="card" style={{ display: "grid", gap: 8 }}>
                    <div className="orders-detail__eyebrow">{ADMIN_UI_STRINGS.orders.shippingAddress}</div>
                    {joinAddress(selectedOrder.addressSnapshot).map((line) => <div key={line}>{line}</div>)}
                  </div>
                ) : null}

                <div style={{ display: "grid", gap: 16 }}>
                  {selectedOrder.items.map((item) => {
                    const status = String(item.fulfillmentStatus || "").toUpperCase();
                    const owner = String(item.physicalOwner || "").toUpperCase();
                    const pendingType = String(item.pendingHandover?.type || "").toUpperCase();
                    const pendingStatus = String(item.pendingHandover?.status || "").toUpperCase();
                    const isCancelledProcessingOwned = status === "CANCEL_REQUESTED" && owner === "PROCESSING_MANAGER";
                    const isCancelledShippingPendingReceipt =
                      status === "CANCEL_REQUESTED" &&
                      pendingType === "PACKAGING_TO_SHIPPING" &&
                      pendingStatus === "PENDING_RECEIPT";
                    const isCancelledPackagingOwned =
                      status === "CANCEL_REQUESTED" &&
                      owner === "PACKAGING_MANAGER" &&
                      !isCancelledShippingPendingReceipt;
                    const isCancelledShippingOwned = status === "CANCEL_REQUESTED" && owner === "SHIPPING_OPERATOR";
                    const hasProcessingAccess = isSystemBypass ||
                      hasAnyPermission(permissions, ["order:processing", "order:pack", "order:override", "order:admin"]) ||
                      roleNames.includes("PROCESSING_MANAGER") ||
                      roleNames.includes("ORDER_PROCESSOR") ||
                      roleNames.includes("ORDER_OPERATOR") ||
                      roleNames.includes("ORDER_OPERATIONS");
                    const hasPackagingAccess = isSystemBypass ||
                      hasAnyPermission(permissions, ["order:packaging", "order:pack", "order:override", "order:admin"]) ||
                      roleNames.includes("PACKAGING_MANAGER") ||
                      roleNames.includes("ORDER_OPERATIONS");
                    const hasShippingAccess = isSystemBypass ||
                      hasAnyPermission(permissions, ["order:shipping", "order:ship", "order:override", "order:admin"]) ||
                      roleNames.includes("SHIPPING_OPERATOR") ||
                      roleNames.includes("SHIPPING_MANAGER") ||
                      roleNames.includes("ORDER_OPERATIONS");
                    const hasCancellationAccess = isSystemBypass ||
                      hasAnyPermission(permissions, ["order:cancellation", "order:cancel:manage", "order:cancel", "order:override", "order:admin"]) ||
                      roleNames.includes("CANCELLATION_MANAGER") ||
                      roleNames.includes("RETURN_MANAGER") ||
                      roleNames.includes("ORDER_OPERATIONS");
                    const hasAdminAccess = isSystemBypass ||
                      hasAnyPermission(permissions, ["order:admin", "order:override", "order:cancel"]) ||
                      roleNames.includes("ORDER_ADMIN") ||
                      roleNames.includes("ORDER_MANAGER") ||
                      roleNames.includes("ORDER_OPERATIONS");

                    const canAdminCancel = hasAdminAccess &&
                      !["SHIPPED", "DELIVERED", "CANCELLED_BEFORE_PICKING", "CANCEL_RESTOCKED", "CANCEL_DAMAGED", "CANCEL_LOST", "CANCEL_CLOSED"].includes(status);
                    const canProcessingPick = lane === "processing" && status === "RESERVED" && hasProcessingAccess;
                    const canProcessingHandover = lane === "processing" && status === "PICKED_FROM_WAREHOUSE" && hasProcessingAccess;

                    const canPackagingConfirm = lane === "packaging" && status === "HANDED_TO_PACKAGING" && hasPackagingAccess;
                    const canPackagingReject = lane === "packaging" && status === "HANDED_TO_PACKAGING" && hasPackagingAccess;
                    const canPackagingStart = lane === "packaging" && status === "PACKAGING_RECEIVED" && hasPackagingAccess;
                    const canPackagingVerify = lane === "packaging" && status === "PACKAGING_IN_PROGRESS" && item.packageVerificationStatus !== "VERIFIED" && hasPackagingAccess;
                    const canPackagingPrint = lane === "packaging" && status === "PACKAGING_IN_PROGRESS" && item.packageVerificationStatus === "VERIFIED" && item.labelStatus !== "PRINTED" && hasPackagingAccess;
                    const canPackagingReprint = lane === "packaging" && status === "PACKAGING_IN_PROGRESS" && item.labelStatus === "PRINTED" && hasPackagingAccess;
                    const canPackagingPack = lane === "packaging" && status === "PACKAGING_IN_PROGRESS" && item.packageVerificationStatus === "VERIFIED" && item.labelStatus === "PRINTED" && hasPackagingAccess;
                    const canPackagingHandover = lane === "packaging" && status === "PACKED" && hasPackagingAccess;

                    const canShippingConfirm = lane === "shipping" && (status === "HANDED_TO_SHIPPING" || isCancelledShippingPendingReceipt) && hasShippingAccess;
                    const canShippingReject = lane === "shipping" && (status === "HANDED_TO_SHIPPING" || isCancelledShippingPendingReceipt) && hasShippingAccess;
                    const canShippingStart = lane === "shipping" && status === "SHIPPING_RECEIVED" && hasShippingAccess;
                    const canShippingAssignCourier = lane === "shipping" && status === "SHIPPING_IN_PROGRESS" && hasShippingAccess;
                    const canShippingTracking = lane === "shipping" && status === "SHIPPING_IN_PROGRESS" && hasShippingAccess;
                    const canShippingMarkShipped = lane === "shipping" && status === "SHIPPING_IN_PROGRESS" && !!item.courierName && !!item.outboundTrackingNumber && hasShippingAccess;

                    const canCancellationHandover =
                      (lane === "processing" && isCancelledProcessingOwned && hasProcessingAccess) ||
                      (lane === "packaging" && isCancelledPackagingOwned && hasPackagingAccess) ||
                      (lane === "shipping" && isCancelledShippingOwned && hasShippingAccess);
                    const canCancellationConfirm = lane === "cancellations" && status === "HANDED_TO_CANCELLATION" && hasCancellationAccess;
                    const canCancellationRestock = lane === "cancellations" && status === "CANCELLATION_RECEIVED" && hasCancellationAccess;
                    const canCancellationDamaged = lane === "cancellations" && status === "CANCELLATION_RECEIVED" && hasCancellationAccess;
                    const canCancellationLost = lane === "cancellations" && ["HANDED_TO_CANCELLATION", "CANCELLATION_RECEIVED"].includes(status) && hasCancellationAccess;
                    const canViewLabel = !isCancelledPackagingOwned && (canPackagingPrint || canPackagingReprint || item.labelStatus === "PRINTED");

                    return (
                      <article key={item.id} className="card" style={{ display: "grid", gap: 14 }}>
                        <div className="row" style={{ justifyContent: "space-between", alignItems: "start", flexWrap: "wrap" }}>
                          <div>
                            <strong>{item.title}</strong>
                            <div className="section-copy">{item.stockKey || "-"}</div>
                            <div className="section-copy">
                              {ADMIN_UI_STRINGS.orders.itemStateLabel}: {statusLabel(item.fulfillmentStatus)}
                            </div>
                            <div className="section-copy">
                              {ADMIN_UI_STRINGS.orders.physicalOwnerLabel}: {item.physicalOwner || "-"}
                            </div>
                            {getLaneDescription(lane, item) ? (
                              <div className="section-copy">{getLaneDescription(lane, item)}</div>
                            ) : null}
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div>{ADMIN_UI_STRINGS.orders.itemQuantityLabel}: {item.quantity}</div>
                            <strong>{formatCurrency(getItemAmount(item))}</strong>
                          </div>
                        </div>

                        <div className="orders-item-meta">
                          {item.packageVerificationStatus ? (
                            <span>{ADMIN_UI_STRINGS.orders.packageVerificationLabel}: {item.packageVerificationStatus}</span>
                          ) : null}
                          {item.labelStatus ? (
                            <span>{ADMIN_UI_STRINGS.orders.labelStatusLabel}: {item.labelStatus}</span>
                          ) : null}
                          {item.labelReprintCount ? (
                            <span>{ADMIN_UI_STRINGS.orders.labelReprintsLabel}: {item.labelReprintCount}</span>
                          ) : null}
                          {item.courierName ? (
                            <span>{ADMIN_UI_STRINGS.orders.courierLabel}: {item.courierName}</span>
                          ) : null}
                          {item.outboundTrackingNumber ? (
                            <span>{ADMIN_UI_STRINGS.orders.outboundTrackingLabel}: {item.outboundTrackingNumber}</span>
                          ) : null}
                          {item.pendingHandover?.type ? (
                            <span>{ADMIN_UI_STRINGS.orders.pendingHandoverLabel}: {item.pendingHandover.type}</span>
                          ) : null}
                          {item.cancellationReason ? (
                            <span>{ADMIN_UI_STRINGS.orders.cancellationReasonLabel}: {item.cancellationReason}</span>
                          ) : null}
                        </div>

                        {getTimeline(item).length ? (
                          <div className="orders-item-timeline">
                            {getTimeline(item).map(([label, value]) => (
                              <span key={`${item.id}:${label}`}>{label}: {formatDate(value)}</span>
                            ))}
                          </div>
                        ) : null}

                        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                          {canAdminCancel ? (
                            <button
                              className="danger"
                              disabled={actionBusyKey === `${item.id}:/api/admin/orders/order-items/${item.id}/cancel`}
                              onClick={() => performAction(
                                selectedOrder.id,
                                item.id,
                                `/api/admin/orders/order-items/${encodeURIComponent(item.id)}/cancel`,
                                { reason: "ADMIN_CANCELLED" },
                                { confirmMessage: ADMIN_UI_STRINGS.orders.cancelConfirm }
                              )}
                            >
                              {ADMIN_UI_STRINGS.orders.cancelItem}
                            </button>
                          ) : null}

                          {canProcessingPick ? (
                            <button onClick={() => performAction(selectedOrder.id, item.id, `/api/admin/orders/${encodeURIComponent(selectedOrder.id)}/items/${encodeURIComponent(item.id)}/pick`)}>
                              {ADMIN_UI_STRINGS.orders.pickItem}
                            </button>
                          ) : null}
                          {canProcessingHandover ? (
                            <button onClick={() => performAction(selectedOrder.id, item.id, `/api/admin/orders/${encodeURIComponent(selectedOrder.id)}/items/${encodeURIComponent(item.id)}/handover-to-packaging`)}>
                              {ADMIN_UI_STRINGS.orders.handoverToPackaging}
                            </button>
                          ) : null}

                          {canPackagingConfirm ? (
                            <button onClick={() => performAction(selectedOrder.id, item.id, `/api/admin/orders/${encodeURIComponent(selectedOrder.id)}/items/${encodeURIComponent(item.id)}/confirm-packaging-receipt`)}>
                              {ADMIN_UI_STRINGS.orders.confirmPackagingReceipt}
                            </button>
                          ) : null}
                          {canPackagingReject ? (
                            <button
                              className="secondary"
                              onClick={() => {
                                const reason = window.prompt(ADMIN_UI_STRINGS.orders.rejectPackagingPrompt, "ITEM_NOT_RECEIVED") || "";
                                if (!reason.trim()) return;
                                void performAction(
                                  selectedOrder.id,
                                  item.id,
                                  `/api/admin/orders/${encodeURIComponent(selectedOrder.id)}/items/${encodeURIComponent(item.id)}/reject-packaging-receipt`,
                                  { reason }
                                );
                              }}
                            >
                              {ADMIN_UI_STRINGS.orders.rejectPackagingReceipt}
                            </button>
                          ) : null}
                          {canPackagingStart ? (
                            <button onClick={() => performAction(selectedOrder.id, item.id, `/api/admin/orders/${encodeURIComponent(selectedOrder.id)}/items/${encodeURIComponent(item.id)}/start-packaging`)}>
                              {ADMIN_UI_STRINGS.orders.startPackaging}
                            </button>
                          ) : null}
                          {canPackagingVerify ? (
                            <button onClick={() => performAction(selectedOrder.id, item.id, `/api/admin/orders/${encodeURIComponent(selectedOrder.id)}/items/${encodeURIComponent(item.id)}/verify-package`)}>
                              {ADMIN_UI_STRINGS.orders.verifyPackage}
                            </button>
                          ) : null}
                          {canPackagingPrint ? (
                            <button
                              onClick={() => performAction(
                                selectedOrder.id,
                                item.id,
                                `/api/admin/orders/${encodeURIComponent(selectedOrder.id)}/items/${encodeURIComponent(item.id)}/print-label`,
                                undefined,
                                { afterSuccess: () => openLabelPreview(selectedOrder.id, item.id) }
                              )}
                            >
                              {ADMIN_UI_STRINGS.orders.printLabel}
                            </button>
                          ) : null}
                          {canPackagingReprint ? (
                            <button
                              className="secondary"
                              onClick={() => {
                                const reason = window.prompt(ADMIN_UI_STRINGS.orders.reprintLabelPrompt, "LABEL_DAMAGED") || "";
                                if (!reason.trim()) return;
                                void performAction(
                                  selectedOrder.id,
                                  item.id,
                                  `/api/admin/orders/${encodeURIComponent(selectedOrder.id)}/items/${encodeURIComponent(item.id)}/reprint-label`,
                                  { reason },
                                  { afterSuccess: () => openLabelPreview(selectedOrder.id, item.id) }
                                );
                              }}
                            >
                              {ADMIN_UI_STRINGS.orders.reprintLabel}
                            </button>
                          ) : null}
                          {canViewLabel ? (
                            <button className="secondary" onClick={() => openLabelPreview(selectedOrder.id, item.id)}>
                              {ADMIN_UI_STRINGS.orders.viewLabel}
                            </button>
                          ) : null}
                          {canPackagingPack ? (
                            <button onClick={() => performAction(selectedOrder.id, item.id, `/api/admin/orders/${encodeURIComponent(selectedOrder.id)}/items/${encodeURIComponent(item.id)}/mark-packed`)}>
                              {ADMIN_UI_STRINGS.orders.markPacked}
                            </button>
                          ) : null}
                          {canPackagingHandover ? (
                            <button onClick={() => performAction(selectedOrder.id, item.id, `/api/admin/orders/${encodeURIComponent(selectedOrder.id)}/items/${encodeURIComponent(item.id)}/handover-to-shipping`)}>
                              {ADMIN_UI_STRINGS.orders.handoverToShipping}
                            </button>
                          ) : null}

                          {canShippingConfirm ? (
                            <button onClick={() => performAction(selectedOrder.id, item.id, `/api/admin/orders/${encodeURIComponent(selectedOrder.id)}/items/${encodeURIComponent(item.id)}/confirm-shipping-receipt`)}>
                              {ADMIN_UI_STRINGS.orders.confirmShippingReceipt}
                            </button>
                          ) : null}
                          {canShippingReject ? (
                            <button
                              className="secondary"
                              onClick={() => {
                                const reason = window.prompt(ADMIN_UI_STRINGS.orders.rejectShippingPrompt, "ITEM_NOT_RECEIVED") || "";
                                if (!reason.trim()) return;
                                void performAction(
                                  selectedOrder.id,
                                  item.id,
                                  `/api/admin/orders/${encodeURIComponent(selectedOrder.id)}/items/${encodeURIComponent(item.id)}/reject-shipping-receipt`,
                                  { reason }
                                );
                              }}
                            >
                              {ADMIN_UI_STRINGS.orders.rejectShippingReceipt}
                            </button>
                          ) : null}
                          {canShippingStart ? (
                            <button onClick={() => performAction(selectedOrder.id, item.id, `/api/admin/orders/${encodeURIComponent(selectedOrder.id)}/items/${encodeURIComponent(item.id)}/start-shipping`)}>
                              {ADMIN_UI_STRINGS.orders.startShipping}
                            </button>
                          ) : null}
                          {canShippingAssignCourier ? (
                            <button
                              onClick={() => {
                                const courierName = window.prompt(ADMIN_UI_STRINGS.orders.assignCourierPrompt, item.courierName || "") || "";
                                if (!courierName.trim()) return;
                                void performAction(
                                  selectedOrder.id,
                                  item.id,
                                  `/api/admin/orders/${encodeURIComponent(selectedOrder.id)}/items/${encodeURIComponent(item.id)}/assign-courier`,
                                  { courierName }
                                );
                              }}
                            >
                              {item.courierName ? ADMIN_UI_STRINGS.orders.updateCourier : ADMIN_UI_STRINGS.orders.assignCourier}
                            </button>
                          ) : null}
                          {canShippingTracking ? (
                            <button
                              onClick={() => {
                                const trackingNumber = window.prompt(ADMIN_UI_STRINGS.orders.trackingPrompt, item.outboundTrackingNumber || "") || "";
                                if (!trackingNumber.trim()) return;
                                void performAction(
                                  selectedOrder.id,
                                  item.id,
                                  `/api/admin/orders/${encodeURIComponent(selectedOrder.id)}/items/${encodeURIComponent(item.id)}/tracking`,
                                  { trackingNumber }
                                );
                              }}
                            >
                              {item.outboundTrackingNumber ? ADMIN_UI_STRINGS.orders.updateTrackingNumber : ADMIN_UI_STRINGS.orders.enterTrackingNumber}
                            </button>
                          ) : null}
                          {canShippingMarkShipped ? (
                            <button onClick={() => performAction(selectedOrder.id, item.id, `/api/admin/orders/${encodeURIComponent(selectedOrder.id)}/items/${encodeURIComponent(item.id)}/mark-shipped`)}>
                              {ADMIN_UI_STRINGS.orders.shipItem}
                            </button>
                          ) : null}

                          {canCancellationHandover ? (
                            <button onClick={() => performAction(selectedOrder.id, item.id, `/api/admin/orders/${encodeURIComponent(selectedOrder.id)}/items/${encodeURIComponent(item.id)}/handover-to-cancellation`)}>
                              {ADMIN_UI_STRINGS.orders.handoverToCancellation}
                            </button>
                          ) : null}
                          {canCancellationConfirm ? (
                            <button onClick={() => performAction(selectedOrder.id, item.id, `/api/admin/orders/${encodeURIComponent(selectedOrder.id)}/items/${encodeURIComponent(item.id)}/confirm-cancellation-receipt`)}>
                              {ADMIN_UI_STRINGS.orders.confirmCancellationReceipt}
                            </button>
                          ) : null}
                          {canCancellationRestock ? (
                            <button onClick={() => performAction(selectedOrder.id, item.id, `/api/admin/orders/${encodeURIComponent(selectedOrder.id)}/items/${encodeURIComponent(item.id)}/restock-cancelled`)}>
                              {ADMIN_UI_STRINGS.orders.restockCancelledItem}
                            </button>
                          ) : null}
                          {canCancellationDamaged ? (
                            <button
                              className="secondary"
                              onClick={() => performAction(selectedOrder.id, item.id, `/api/admin/orders/${encodeURIComponent(selectedOrder.id)}/items/${encodeURIComponent(item.id)}/mark-cancelled-damaged`)}
                            >
                              {ADMIN_UI_STRINGS.orders.markCancelledDamaged}
                            </button>
                          ) : null}
                          {canCancellationLost ? (
                            <button
                              className="secondary"
                              onClick={() => performAction(selectedOrder.id, item.id, `/api/admin/orders/${encodeURIComponent(selectedOrder.id)}/items/${encodeURIComponent(item.id)}/mark-cancelled-lost`)}
                            >
                              {ADMIN_UI_STRINGS.orders.markCancelledLost}
                            </button>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {totalPages > 1 ? (
        <PaginationControls
          page={page}
          totalPages={totalPages}
          total={total}
          onPrevious={() => setPage((current) => Math.max(1, current - 1))}
          onNext={() => setPage((current) => Math.min(totalPages, current + 1))}
          previousLabel={ADMIN_UI_STRINGS.common.previous}
          nextLabel={ADMIN_UI_STRINGS.common.next}
        />
      ) : null}
    </ProtectedPage>
  );
}
