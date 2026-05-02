"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ProtectedPage } from "@/components/ProtectedPage";
import { PaginationControls } from "@/components/PaginationControls";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/api";
import { ADMIN_UI_STRINGS } from "@/lib/uiStrings";

const PAGE_SIZE = 25;

type CaseKind = "RETURN" | "EXCHANGE";

type ReturnExchangeCase = {
  caseId: string;
  kind: CaseKind;
  orderItemId: string;
  productName: string;
  reason: string;
  requestDate?: string | null;
  status: string;
  phoneNumber?: string;
  whatsappNumber?: string;
  courierName?: string;
  returnTrackingNumber?: string;
  decisionNote?: string;
  customer?: {
    id?: string;
    name?: string;
    email?: string;
    phone?: string;
  } | null;
  order?: {
    id?: string;
    placedAt?: string | null;
    paymentStatus?: string;
    fulfillmentStatus?: string;
    addressSnapshot?: {
      fullName?: string;
      phone?: string;
      line1?: string;
      line2?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      country?: string;
    } | null;
  } | null;
  orderItem?: {
    id?: string;
    title?: string;
    quantity?: number;
    fulfillmentStatus?: string;
    deliveredAt?: string | null;
    imageUrl?: string;
    stockKey?: string;
  } | null;
  investigationStartedAt?: string | null;
  acceptedAt?: string | null;
  rejectedAt?: string | null;
  trackingUpdatedAt?: string | null;
  receivedAt?: string | null;
  placeholderCreatedAt?: string | null;
  couponGeneratedAt?: string | null;
  coupon?: {
    id?: string;
    generatedAt?: string | null;
  } | null;
};

type PaginatedResponse = {
  items: ReturnExchangeCase[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

type CaseAddressSnapshot = NonNullable<NonNullable<ReturnExchangeCase["order"]>["addressSnapshot"]>;

const TAB_LABELS: Record<CaseKind, string> = {
  RETURN: "Returns",
  EXCHANGE: "Exchanges",
};

const STATUS_LABELS: Record<string, string> = {
  RETURN_REQUESTED: "Return Requested",
  RETURN_UNDER_INVESTIGATION: "Return Under Investigation",
  RETURN_ACCEPTED: "Return Accepted",
  RETURN_REJECTED: "Return Rejected",
  RETURN_IN_TRANSIT: "Return In Transit",
  RETURN_RECEIVED: "Return Received",
  RETURN_REFUND_PLACEHOLDER_PENDING: "Refund Placeholder Pending",
  EXCHANGE_REQUESTED: "Exchange Requested",
  EXCHANGE_UNDER_INVESTIGATION: "Exchange Under Investigation",
  EXCHANGE_ACCEPTED: "Exchange Accepted",
  EXCHANGE_REJECTED: "Exchange Rejected",
  EXCHANGE_IN_TRANSIT: "Exchange In Transit",
  EXCHANGE_RECEIVED: "Exchange Received",
  EXCHANGE_COUPON_GENERATED: "Exchange Coupon Generated",
};

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function statusLabel(status: string) {
  return STATUS_LABELS[status] || status;
}

function joinAddress(address?: CaseAddressSnapshot | null) {
  if (!address) return [];
  return [
    address.fullName,
    [address.line1, address.line2].filter(Boolean).join(", "),
    [address.city, address.state, address.postalCode].filter(Boolean).join(", "),
    address.country,
    address.phone,
  ].filter(Boolean) as string[];
}

function canShowFullDetails(caseDoc?: ReturnExchangeCase | null) {
  if (!caseDoc) return false;
  return !["RETURN_REQUESTED", "EXCHANGE_REQUESTED"].includes(caseDoc.status);
}

export default function ReturnExchangeOrdersPage() {
  const { accessToken, refreshAccessToken } = useAuth();
  const [activeTab, setActiveTab] = useState<CaseKind>("RETURN");
  const [cases, setCases] = useState<ReturnExchangeCase[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionBusy, setActionBusy] = useState("");

  const selectedCase = useMemo(
    () => cases.find((caseDoc) => caseDoc.caseId === selectedCaseId) || cases[0] || null,
    [cases, selectedCaseId]
  );

  const load = async (preferredCaseId = "") => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        kind: activeTab,
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      if (search) params.set("search", search);

      const payload = await apiRequest<PaginatedResponse>(`/api/admin/orders/returns-exchanges?${params.toString()}`, {
        token: accessToken,
        onUnauthorized: refreshAccessToken,
      });

      const items = payload.items || [];
      setCases(items);
      setTotal(Number(payload.total || 0));
      setTotalPages(Math.max(1, Number(payload.totalPages || 1)));
      setSelectedCaseId((current) => {
        const candidate = preferredCaseId || current;
        if (candidate && items.some((caseDoc) => caseDoc.caseId === candidate)) return candidate;
        return items[0]?.caseId || "";
      });
      setError("");
      setActionError("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch((current) => current === searchInput.trim() ? current : searchInput.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    void load();
  }, [activeTab, page, search, accessToken]);

  const performAction = async (endpoint: string, body?: Record<string, unknown>) => {
    if (!selectedCase || actionBusy) return;
    setActionBusy(endpoint);
    setActionError("");
    try {
      await apiRequest<{ case: ReturnExchangeCase }>(endpoint, {
        method: "POST",
        token: accessToken,
        onUnauthorized: refreshAccessToken,
        body,
      });
      await load(selectedCase.caseId);
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setActionBusy("");
    }
  };

  return (
    <ProtectedPage anyOf={["order:return"]}>
      <section className="card row" style={{ justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div className="orders-detail__eyebrow">{ADMIN_UI_STRINGS.orders.summaryReturnExchangeQueue}</div>
          <h1 style={{ margin: "6px 0 0" }}>{ADMIN_UI_STRINGS.menu.returnExchangeManager}</h1>
        </div>
        <div className="row">
          <Link href="/admin/orders/dashboard"><button className="secondary">{ADMIN_UI_STRINGS.orders.backToDashboard}</button></Link>
          <button className="secondary" onClick={() => void load(selectedCase?.caseId || "")}>{ADMIN_UI_STRINGS.common.refresh}</button>
        </div>
      </section>

      <section className="card row" style={{ gap: 12, alignItems: "end", flexWrap: "wrap" }}>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          {(Object.keys(TAB_LABELS) as CaseKind[]).map((kind) => (
            <button
              key={kind}
              type="button"
              className={activeTab === kind ? "" : "secondary"}
              onClick={() => {
                setActiveTab(kind);
                setPage(1);
              }}
            >
              {TAB_LABELS[kind]}
            </button>
          ))}
        </div>
        <label style={{ minWidth: 240, flex: "1 1 240px" }}>
          {ADMIN_UI_STRINGS.orders.searchLabel}
          <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} />
        </label>
        <div className="section-copy">
          {ADMIN_UI_STRINGS.orders.summaryQueueCount}: {total}
        </div>
      </section>

      {error ? <div className="error">{error}</div> : null}
      {actionError ? <div className="error">{actionError}</div> : null}
      {loading ? <div>{ADMIN_UI_STRINGS.common.loadingOrders}</div> : null}

      {!loading && !cases.length ? (
        <section className="card">
          <p className="section-copy">{ADMIN_UI_STRINGS.orders.emptyQueue}</p>
        </section>
      ) : null}

      {cases.length ? (
        <div className="orders-layout">
          <aside className="orders-list">
            {cases.map((caseDoc) => (
              <button
                key={caseDoc.caseId}
                type="button"
                className={`orders-list__row ${selectedCase?.caseId === caseDoc.caseId ? "is-active" : ""}`}
                onClick={() => setSelectedCaseId(caseDoc.caseId)}
              >
                <div>
                  <strong>{caseDoc.productName || caseDoc.orderItemId}</strong>
                  <div className="section-copy">{caseDoc.kind}</div>
                  <div className="section-copy">{formatDate(caseDoc.requestDate)}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div>{statusLabel(caseDoc.status)}</div>
                  <div className="section-copy">{caseDoc.caseId.slice(-6).toUpperCase()}</div>
                </div>
              </button>
            ))}
          </aside>

          <section className="card orders-detail">
            {selectedCase ? (
              <div style={{ display: "grid", gap: 18 }}>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "start", flexWrap: "wrap" }}>
                  <div>
                    <div className="orders-detail__eyebrow">{selectedCase.kind}</div>
                    <h2 style={{ margin: "6px 0 0" }}>{selectedCase.productName}</h2>
                    <div className="section-copy">Case ID: {selectedCase.caseId}</div>
                    <div className="section-copy">Order Item ID: {selectedCase.orderItemId}</div>
                    <div className="section-copy">Status: {statusLabel(selectedCase.status)}</div>
                    <div className="section-copy">Requested: {formatDate(selectedCase.requestDate)}</div>
                  </div>
                </div>

                <div className="card" style={{ display: "grid", gap: 6 }}>
                  <div className="orders-detail__eyebrow">Request Summary</div>
                  <div><strong>Reason:</strong> {selectedCase.reason || "-"}</div>
                </div>

                {canShowFullDetails(selectedCase) ? (
                  <>
                    <div className="card" style={{ display: "grid", gap: 6 }}>
                      <div className="orders-detail__eyebrow">Customer Details</div>
                      <div><strong>Name:</strong> {selectedCase.customer?.name || "-"}</div>
                      <div><strong>Email:</strong> {selectedCase.customer?.email || "-"}</div>
                      {selectedCase.phoneNumber ? <div><strong>Phone:</strong> {selectedCase.phoneNumber}</div> : null}
                      {selectedCase.whatsappNumber ? <div><strong>WhatsApp:</strong> {selectedCase.whatsappNumber}</div> : null}
                    </div>

                    <div className="card" style={{ display: "grid", gap: 6 }}>
                      <div className="orders-detail__eyebrow">Order Details</div>
                      <div><strong>Order ID:</strong> {selectedCase.order?.id || "-"}</div>
                      <div><strong>Placed At:</strong> {formatDate(selectedCase.order?.placedAt)}</div>
                      <div><strong>Payment Status:</strong> {selectedCase.order?.paymentStatus || "-"}</div>
                      <div><strong>Fulfillment Status:</strong> {selectedCase.order?.fulfillmentStatus || "-"}</div>
                      {joinAddress(selectedCase.order?.addressSnapshot).length ? (
                        <div>
                          <strong>Shipping Address:</strong>
                          <div className="section-copy">{joinAddress(selectedCase.order?.addressSnapshot).join(" | ")}</div>
                        </div>
                      ) : null}
                    </div>

                    <div className="card" style={{ display: "grid", gap: 6 }}>
                      <div className="orders-detail__eyebrow">Case Details</div>
                      <div><strong>Item Title:</strong> {selectedCase.orderItem?.title || selectedCase.productName || "-"}</div>
                      <div><strong>Quantity:</strong> {selectedCase.orderItem?.quantity || "-"}</div>
                      <div><strong>Delivered At:</strong> {formatDate(selectedCase.orderItem?.deliveredAt)}</div>
                      <div><strong>Investigation Started:</strong> {formatDate(selectedCase.investigationStartedAt)}</div>
                      <div><strong>Accepted At:</strong> {formatDate(selectedCase.acceptedAt)}</div>
                      <div><strong>Rejected At:</strong> {formatDate(selectedCase.rejectedAt)}</div>
                      <div><strong>Tracking Updated:</strong> {formatDate(selectedCase.trackingUpdatedAt)}</div>
                      <div><strong>Received At:</strong> {formatDate(selectedCase.receivedAt)}</div>
                      <div><strong>Placeholder Created:</strong> {formatDate(selectedCase.placeholderCreatedAt)}</div>
                      <div><strong>Coupon Generated:</strong> {formatDate(selectedCase.couponGeneratedAt || selectedCase.coupon?.generatedAt)}</div>
                      {selectedCase.decisionNote ? <div><strong>Decision Note:</strong> {selectedCase.decisionNote}</div> : null}
                      {selectedCase.courierName ? <div><strong>Courier:</strong> {selectedCase.courierName}</div> : null}
                      {selectedCase.returnTrackingNumber ? <div><strong>Tracking Number:</strong> {selectedCase.returnTrackingNumber}</div> : null}
                    </div>
                  </>
                ) : (
                  <div className="card">
                    <p className="section-copy">Customer contacts and detailed order information become visible after investigation starts.</p>
                  </div>
                )}

                <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                  {selectedCase.status === `${selectedCase.kind}_REQUESTED` ? (
                    <button
                      disabled={!!actionBusy}
                      onClick={() => void performAction(`/api/admin/orders/returns-exchanges/${encodeURIComponent(selectedCase.caseId)}/start-investigation`)}
                    >
                      Start Investigation
                    </button>
                  ) : null}

                  {selectedCase.status === `${selectedCase.kind}_UNDER_INVESTIGATION` ? (
                    <>
                      <button
                        disabled={!!actionBusy}
                        onClick={() => {
                          const decisionNote = window.prompt("Enter acceptance note", selectedCase.decisionNote || "") || "";
                          void performAction(`/api/admin/orders/returns-exchanges/${encodeURIComponent(selectedCase.caseId)}/accept`, { decisionNote });
                        }}
                      >
                        Accept
                      </button>
                      <button
                        className="secondary"
                        disabled={!!actionBusy}
                        onClick={() => {
                          const decisionNote = window.prompt("Enter rejection note", selectedCase.decisionNote || "") || "";
                          if (!decisionNote.trim()) return;
                          void performAction(`/api/admin/orders/returns-exchanges/${encodeURIComponent(selectedCase.caseId)}/reject`, { decisionNote });
                        }}
                      >
                        Reject
                      </button>
                    </>
                  ) : null}

                  {selectedCase.status === `${selectedCase.kind}_ACCEPTED` ? (
                    <button
                      disabled={!!actionBusy}
                      onClick={() => {
                        const courierName = window.prompt("Enter courier name", selectedCase.courierName || "") || "";
                        if (!courierName.trim()) return;
                        const returnTrackingNumber = window.prompt("Enter tracking number", selectedCase.returnTrackingNumber || "") || "";
                        if (!returnTrackingNumber.trim()) return;
                        void performAction(`/api/admin/orders/returns-exchanges/${encodeURIComponent(selectedCase.caseId)}/tracking`, {
                          courierName,
                          returnTrackingNumber,
                        });
                      }}
                    >
                      Update Tracking
                    </button>
                  ) : null}

                  {selectedCase.status === `${selectedCase.kind}_IN_TRANSIT` ? (
                    <button
                      disabled={!!actionBusy}
                      onClick={() => void performAction(`/api/admin/orders/returns-exchanges/${encodeURIComponent(selectedCase.caseId)}/receive`)}
                    >
                      Mark Received
                    </button>
                  ) : null}

                  {selectedCase.kind === "RETURN" && selectedCase.status === "RETURN_RECEIVED" ? (
                    <button
                      disabled={!!actionBusy}
                      onClick={() => void performAction(`/api/admin/orders/returns-exchanges/${encodeURIComponent(selectedCase.caseId)}/create-placeholder`)}
                    >
                      Create Placeholder
                    </button>
                  ) : null}

                  {selectedCase.kind === "EXCHANGE" && selectedCase.status === "EXCHANGE_RECEIVED" ? (
                    <button
                      disabled={!!actionBusy}
                      onClick={() => void performAction(`/api/admin/orders/returns-exchanges/${encodeURIComponent(selectedCase.caseId)}/generate-coupon`)}
                    >
                      Generate Coupon
                    </button>
                  ) : null}
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
