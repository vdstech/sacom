"use client";

import React, { useEffect, useState } from "react";
import { PaginationControls } from "@/components/PaginationControls";
import { ProtectedPage } from "@/components/ProtectedPage";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { STOREFRONT_BASE_URL } from "@/lib/config";
import {
  canMarkDelivered,
  formatOrderOperationAddress,
  getOrderOperationStatusOptions,
  isSystemAdmin,
  ORDER_OPERATION_SORT_OPTIONS,
  ORDER_OPERATIONS_TABS,
  type OrderOperationsItem,
  type OrderOperationsResponse,
  type OrderOperationsSort,
  type OrderOperationsSummary,
  type OrderOperationsTab,
} from "@/lib/orderOperationsDashboard";
import { ADMIN_UI_STRINGS } from "@/lib/uiStrings";

const PAGE_SIZE = 25;

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

export function buildOrderOperationsProductHref(slug?: string) {
  const base = STOREFRONT_BASE_URL.replace(/\/$/, "");
  if (!slug) return `${base}/products`;
  return `${base}/products/${encodeURIComponent(slug)}`;
}

export type OrderOperationsDashboardViewProps = {
  tab: OrderOperationsTab;
  summary: OrderOperationsSummary;
  items: OrderOperationsItem[];
  total: number;
  page: number;
  totalPages: number;
  loading: boolean;
  error: string;
  actionError: string;
  searchInput: string;
  statusFilter: string;
  courierFilter: string;
  sort: OrderOperationsSort;
  expandedItemIds: string[];
  actionBusyItemId: string;
  onTabChange: (tab: OrderOperationsTab) => void;
  onSearchInputChange: (value: string) => void;
  onStatusFilterChange: (value: string) => void;
  onCourierFilterChange: (value: string) => void;
  onSortChange: (value: OrderOperationsSort) => void;
  onToggleExpanded: (itemId: string) => void;
  onRefresh: () => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
  onMarkDelivered: (item: OrderOperationsItem) => void;
};

export function OrderOperationsDashboardView({
  tab,
  summary,
  items,
  total,
  page,
  totalPages,
  loading,
  error,
  actionError,
  searchInput,
  statusFilter,
  courierFilter,
  sort,
  expandedItemIds,
  actionBusyItemId,
  onTabChange,
  onSearchInputChange,
  onStatusFilterChange,
  onCourierFilterChange,
  onSortChange,
  onToggleExpanded,
  onRefresh,
  onPreviousPage,
  onNextPage,
  onMarkDelivered,
}: OrderOperationsDashboardViewProps) {
  const statusOptions = getOrderOperationStatusOptions(tab);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section className="card row" style={{ justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div>
          <div className="orders-detail__eyebrow">{ADMIN_UI_STRINGS.orders.dashboardTitle}</div>
          <h1 style={{ margin: "6px 0 0" }}>{ADMIN_UI_STRINGS.orders.operationsSubtitle}</h1>
        </div>
        <button className="secondary" onClick={onRefresh}>{ADMIN_UI_STRINGS.common.refresh}</button>
      </section>

      <section className="card orders-operations-tabs" aria-label={ADMIN_UI_STRINGS.orders.operationsTabsLabel}>
        {ORDER_OPERATIONS_TABS.map((tabMeta) => (
          <button
            key={tabMeta.key}
            type="button"
            className={`orders-operations-tab ${tab === tabMeta.key ? "is-active" : ""}`}
            onClick={() => onTabChange(tabMeta.key)}
          >
            <span>{tabMeta.label}</span>
            <strong>{summary[tabMeta.key]}</strong>
          </button>
        ))}
      </section>

      <section className="card orders-operations-toolbar">
        <label className="orders-operations-toolbar__field">
          <span>{ADMIN_UI_STRINGS.orders.searchLabel}</span>
          <input
            value={searchInput}
            placeholder={ADMIN_UI_STRINGS.orders.operationsSearchPlaceholder}
            onChange={(event) => onSearchInputChange(event.target.value)}
          />
        </label>

        {statusOptions.length ? (
          <label className="orders-operations-toolbar__field">
            <span>{ADMIN_UI_STRINGS.orders.filterStatusLabel}</span>
            <select value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value)}>
              <option value="">{ADMIN_UI_STRINGS.orders.allStatuses}</option>
              {statusOptions.map((value) => (
                <option key={value} value={value}>{statusLabel(value)}</option>
              ))}
            </select>
          </label>
        ) : (
          <label className="orders-operations-toolbar__field">
            <span>{ADMIN_UI_STRINGS.orders.filterCourierLabel}</span>
            <input
              value={courierFilter}
              placeholder={ADMIN_UI_STRINGS.orders.operationsCourierPlaceholder}
              onChange={(event) => onCourierFilterChange(event.target.value)}
            />
          </label>
        )}

        <label className="orders-operations-toolbar__field">
          <span>{ADMIN_UI_STRINGS.orders.sortLabel}</span>
          <select value={sort} onChange={(event) => onSortChange(event.target.value as OrderOperationsSort)}>
            {ORDER_OPERATION_SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </section>

      {error ? <div className="error">{error}</div> : null}
      {actionError ? <div className="error">{actionError}</div> : null}
      {loading ? <div>{ADMIN_UI_STRINGS.common.loadingOrders}</div> : null}

      {!loading && !items.length ? (
        <section className="card">
          <p className="section-copy">{ADMIN_UI_STRINGS.orders.noOrderItemsFound}</p>
        </section>
      ) : null}

      <section className="orders-operations-list">
        {items.map((item) => {
          const isExpanded = expandedItemIds.includes(item.orderItemId);
          const canDeliver = canMarkDelivered(item, tab);

          return (
            <article key={item.orderItemId} className="card orders-operations-item">
              <div className="orders-operations-item__summary">
                <div className="orders-operations-item__summary-main">
                  <div className="orders-detail__eyebrow">{ADMIN_UI_STRINGS.orders.orderIdLabel}: {item.orderId}</div>
                  <h2>{item.productName}</h2>
                  <div className="orders-operations-item__highlights">
                    <span><strong>{formatCurrency(item.productPrice)}</strong></span>
                    <span>{ADMIN_UI_STRINGS.orders.itemQuantityLabel}: {item.quantity}</span>
                    <span>{ADMIN_UI_STRINGS.orders.customerNameLabel}: {item.customerName || "-"}</span>
                    <span>{statusLabel(item.status)}</span>
                  </div>
                </div>

                <div className="orders-operations-item__summary-actions">
                  <a
                    className="orders-operations-link-button"
                    href={buildOrderOperationsProductHref(item.slug)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {ADMIN_UI_STRINGS.orders.viewProduct}
                  </a>
                  {canDeliver ? (
                    <button
                      type="button"
                      disabled={actionBusyItemId === item.orderItemId}
                      onClick={() => onMarkDelivered(item)}
                    >
                      {ADMIN_UI_STRINGS.orders.markDelivered}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="secondary"
                    aria-expanded={isExpanded}
                    onClick={() => onToggleExpanded(item.orderItemId)}
                  >
                    {isExpanded ? ADMIN_UI_STRINGS.orders.collapseDetails : ADMIN_UI_STRINGS.orders.expandDetails}
                  </button>
                </div>
              </div>

              {canDeliver ? (
                <div className="orders-operations-item__temporary-note">
                  {ADMIN_UI_STRINGS.orders.markDeliveredTemporary}
                </div>
              ) : null}

              {isExpanded ? (
                <div className="orders-operations-item__details">
                  <div><strong>{ADMIN_UI_STRINGS.orders.orderIdLabel}:</strong> {item.orderId}</div>
                  <div><strong>{ADMIN_UI_STRINGS.orders.orderItemIdLabel}:</strong> {item.orderItemId}</div>
                  <div><strong>{ADMIN_UI_STRINGS.orders.productNameLabel}:</strong> {item.productName}</div>
                  <div><strong>{ADMIN_UI_STRINGS.orders.stockKeyLabel}:</strong> {item.sku || "-"}</div>
                  <div><strong>{ADMIN_UI_STRINGS.orders.productPriceLabel}:</strong> {formatCurrency(item.productPrice)}</div>
                  <div><strong>{ADMIN_UI_STRINGS.orders.itemQuantityLabel}:</strong> {item.quantity}</div>
                  <div><strong>{ADMIN_UI_STRINGS.orders.customerNameLabel}:</strong> {item.customerName || "-"}</div>
                  <div><strong>{ADMIN_UI_STRINGS.orders.customerContactLabel}:</strong> {item.customerContact || "-"}</div>
                  <div><strong>{ADMIN_UI_STRINGS.orders.itemStateLabel}:</strong> {statusLabel(item.status)}</div>
                  <div><strong>{ADMIN_UI_STRINGS.orders.physicalOwnerLabel}:</strong> {item.physicalOwner || "-"}</div>
                  <div><strong>{ADMIN_UI_STRINGS.orders.courierLabel}:</strong> {item.courierName || "-"}</div>
                  <div><strong>{ADMIN_UI_STRINGS.orders.outboundTrackingLabel}:</strong> {item.trackingNumber || "-"}</div>
                  <div><strong>{ADMIN_UI_STRINGS.orders.createdAtLabel}:</strong> {formatDate(item.createdAt)}</div>
                  <div><strong>{ADMIN_UI_STRINGS.orders.lastUpdatedLabel}:</strong> {formatDate(item.lastUpdatedAt)}</div>
                  <div className="orders-operations-item__address">
                    <strong>{ADMIN_UI_STRINGS.orders.shippingAddress}:</strong>
                    <div>
                      {formatOrderOperationAddress(item.shippingAddress).length
                        ? formatOrderOperationAddress(item.shippingAddress).map((line) => <div key={`${item.orderItemId}:${line}`}>{line}</div>)
                        : "-"}
                    </div>
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </section>

      <PaginationControls
        page={page}
        totalPages={totalPages}
        total={total}
        onPrevious={onPreviousPage}
        onNext={onNextPage}
        previousLabel={ADMIN_UI_STRINGS.common.previous}
        nextLabel={ADMIN_UI_STRINGS.common.next}
      />
    </div>
  );
}

export function OrderOperationsDashboard() {
  const { accessToken, me, refreshAccessToken } = useAuth();
  const [tab, setTab] = useState<OrderOperationsTab>("processing");
  const [summary, setSummary] = useState<OrderOperationsSummary>({ processing: 0, shipping: 0, shipped: 0, delivered: 0 });
  const [items, setItems] = useState<OrderOperationsItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [courierInput, setCourierInput] = useState("");
  const [courierFilter, setCourierFilter] = useState("");
  const [sort, setSort] = useState<OrderOperationsSort>("newest");
  const [expandedItemIds, setExpandedItemIds] = useState<string[]>([]);
  const [actionBusyItemId, setActionBusyItemId] = useState("");

  const systemLevel = String(me?.systemLevel || me?.user?.systemLevel || "NONE").toUpperCase();
  const adminOnly = isSystemAdmin(systemLevel);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch((current) => current === searchInput.trim() ? current : searchInput.trim());
      setCourierFilter((current) => current === courierInput.trim() ? current : courierInput.trim());
      setPage(1);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [searchInput, courierInput]);

  useEffect(() => {
    if (tab !== "shipped") {
      if (courierInput) setCourierInput("");
      if (courierFilter) setCourierFilter("");
    }
    if (tab === "shipped" && statusFilter) setStatusFilter("");
    setExpandedItemIds([]);
    setPage(1);
  }, [courierFilter, courierInput, statusFilter, tab]);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        tab,
        page: String(page),
        limit: String(PAGE_SIZE),
        sort,
      });
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (tab === "shipped" && courierFilter) params.set("courier", courierFilter);

      const payload = await apiRequest<OrderOperationsResponse>(`/api/admin/orders/operations/items?${params.toString()}`, {
        token: accessToken,
        onUnauthorized: refreshAccessToken,
      });

      setSummary(payload.summary);
      setItems(payload.items || []);
      setTotal(Number(payload.total || 0));
      setTotalPages(Math.max(1, Number(payload.totalPages || 1)));
      setError("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!adminOnly) return;
    void load();
  }, [accessToken, adminOnly, page, search, sort, statusFilter, courierFilter, tab]);

  const toggleExpanded = (itemId: string) => {
    setExpandedItemIds((current) => current.includes(itemId)
      ? current.filter((value) => value !== itemId)
      : [...current, itemId]);
  };

  const handleMarkDelivered = async (item: OrderOperationsItem) => {
    if (!canMarkDelivered(item, tab) || actionBusyItemId) return;
    setActionBusyItemId(item.orderItemId);
    setActionError("");
    try {
      await apiRequest(`/api/admin/orders/${encodeURIComponent(item.orderId)}/items/${encodeURIComponent(item.orderItemId)}/mark-delivered`, {
        method: "POST",
        token: accessToken,
        onUnauthorized: refreshAccessToken,
      });
      setExpandedItemIds((current) => current.filter((value) => value !== item.orderItemId));
      await load();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setActionBusyItemId("");
    }
  };

  return (
    <ProtectedPage>
      {adminOnly ? (
        <OrderOperationsDashboardView
          tab={tab}
          summary={summary}
          items={items}
          total={total}
          page={page}
          totalPages={totalPages}
          loading={loading}
          error={error}
          actionError={actionError}
          searchInput={searchInput}
          statusFilter={statusFilter}
          courierFilter={courierInput}
          sort={sort}
          expandedItemIds={expandedItemIds}
          actionBusyItemId={actionBusyItemId}
          onTabChange={setTab}
          onSearchInputChange={setSearchInput}
          onStatusFilterChange={(value) => {
            setStatusFilter(value);
            setPage(1);
          }}
          onCourierFilterChange={setCourierInput}
          onSortChange={(value) => {
            setSort(value);
            setPage(1);
          }}
          onToggleExpanded={toggleExpanded}
          onRefresh={() => void load()}
          onPreviousPage={() => setPage((current) => Math.max(1, current - 1))}
          onNextPage={() => setPage((current) => Math.min(totalPages, current + 1))}
          onMarkDelivered={(item) => void handleMarkDelivered(item)}
        />
      ) : (
        <div className="card">Forbidden</div>
      )}
    </ProtectedPage>
  );
}
