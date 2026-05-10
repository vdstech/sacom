"use client";

import Link from "next/link";
import { type FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ProtectedPage } from "@/components/ProtectedPage";
import { PaginationControls } from "@/components/PaginationControls";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/api";
import { hasAnyPermission } from "@/lib/permissions";
import { buildCategoryMap, getHierarchyLabel } from "@/lib/categoryHierarchy";
import { ADMIN_UI_STRINGS } from "@/lib/uiStrings";

const PAGE_SIZE = 25;
const RISK_PAGE_SIZE = 10;

type InventoryOrderRef = {
  orderId: string;
  quantity: number;
  placedAt?: string | null;
  status?: string;
  fulfillmentStatus?: string;
};

type InventoryDoc = {
  _id: string;
  stockKey: string;
  variantId?: string;
  sizeLabel?: string;
  quantity: number;
  currentQuantity: number;
  initialQuantity: number;
  soldQuantity: number;
  reorderLevel: number;
  productId?: string;
  productTitle?: string;
  productSlug?: string;
  categoryId?: string;
  orderRefs?: InventoryOrderRef[];
};

type InventoryRiskItem = {
  inventoryId: string;
  productId: string;
  variantId: string;
  productTitle: string;
  productSlug: string;
  stockKey: string;
  variantSummary: string;
  sizeLabel: string;
  categoryId: string;
  categoryName: string;
  availableStock: number;
  reorderLevel: number;
  updatedAt?: string | null;
  isActive: boolean;
  status: "LOW_STOCK" | "OUT_OF_STOCK" | "IN_STOCK";
};

type CategoryRisk = {
  categoryId: string;
  categoryName: string;
  lowStockCount: number;
  outOfStockCount: number;
};

type InventorySummaryPayload = {
  summary: {
    threshold: number;
    totalActiveProducts: number;
    totalActiveVariants: number;
    lowStockVariantsCount: number;
    outOfStockVariantsCount: number;
    lowStockVariants: InventoryRiskItem[];
    outOfStockVariants: InventoryRiskItem[];
    recentUpdatedItems: InventoryRiskItem[];
    categoryRisk: CategoryRisk[];
  };
};

type CategoryDoc = {
  _id: string;
  name: string;
  parent: string | null;
};

type PaginatedResponse<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

type InventoryEditorState = {
  itemId: string;
  title: string;
  stockKey: string;
  quantity: string;
  reorderLevel: string;
  sizeLabel: string;
  productSlug: string;
};

type ProductOrderDetail = InventoryOrderRef & {
  stockKey: string;
  sizeLabel: string;
};

type ProductInventoryRow = {
  id: string;
  title: string;
  productSlug: string;
  categoryId: string;
  initialQuantity: number;
  currentQuantity: number;
  soldQuantity: number;
  lowStockCount: number;
  items: InventoryDoc[];
  orderDetails: ProductOrderDetail[];
};

type InventoryTab = "overview" | "low-stock" | "out-of-stock";

function normalizeInventoryTab(value: string | null): InventoryTab {
  if (value === "low-stock" || value === "out-of-stock") return value;
  return "overview";
}

function getCurrentQuantity(item: InventoryDoc) {
  return Number(item.currentQuantity || item.quantity || 0);
}

function getInitialQuantity(item: InventoryDoc) {
  return Number(item.initialQuantity || 0);
}

function getSoldQuantity(item: InventoryDoc) {
  return Number(item.soldQuantity || 0);
}

function getReorderLevel(item: InventoryDoc) {
  return Number(item.reorderLevel || 0);
}

function isLowStock(item: InventoryDoc) {
  return getCurrentQuantity(item) > 0 && getCurrentQuantity(item) < 2;
}

function formatOrderStatus(orderRef: InventoryOrderRef) {
  return orderRef.fulfillmentStatus || orderRef.status || "processing";
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function statusLabel(value: InventoryRiskItem["status"]) {
  if (value === "OUT_OF_STOCK") return "Out of Stock";
  if (value === "LOW_STOCK") return "Low Stock";
  return "In Stock";
}

function sortLabel(value: string) {
  if (value === "updated_asc") return ADMIN_UI_STRINGS.inventory.sortUpdatedAsc;
  if (value === "stock_asc") return ADMIN_UI_STRINGS.inventory.sortStockAsc;
  if (value === "stock_desc") return ADMIN_UI_STRINGS.inventory.sortStockDesc;
  if (value === "title_asc") return ADMIN_UI_STRINGS.inventory.sortTitleAsc;
  if (value === "title_desc") return ADMIN_UI_STRINGS.inventory.sortTitleDesc;
  return ADMIN_UI_STRINGS.inventory.sortUpdatedDesc;
}

function InventoryDashboardContent() {
  const { accessToken, refreshAccessToken, me } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab = normalizeInventoryTab(searchParams.get("tab"));

  const [items, setItems] = useState<InventoryDoc[]>([]);
  const [categories, setCategories] = useState<CategoryDoc[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("updated_desc");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [summary, setSummary] = useState<InventorySummaryPayload["summary"] | null>(null);
  const [riskPayload, setRiskPayload] = useState<PaginatedResponse<InventoryRiskItem> | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [editor, setEditor] = useState<InventoryEditorState | null>(null);
  const [editorError, setEditorError] = useState("");
  const [saving, setSaving] = useState(false);
  const systemLevel = String(me?.systemLevel || me?.user?.systemLevel || "NONE").toUpperCase();
  const isSystemBypass = systemLevel === "SUPER" || systemLevel === "ADMIN";
  const canUpdateInventory = isSystemBypass || hasAnyPermission(me?.permissions || [], ["product:inventory:update"]);
  const [expandedProductIds, setExpandedProductIds] = useState<string[]>([]);
  const categoryMap = useMemo(() => buildCategoryMap(categories), [categories]);

  useEffect(() => {
    setPage(1);
    setSearchInput("");
    setSearch("");
    setSort(activeTab === "overview" ? "updated_desc" : activeTab === "out-of-stock" ? "updated_desc" : "stock_asc");
  }, [activeTab]);

  const loadCategories = async () => {
    try {
      const payload = await apiRequest<CategoryDoc[]>("/api/categories", {
        service: "catalog",
        token: accessToken,
        onUnauthorized: refreshAccessToken,
      });
      setCategories(payload || []);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const loadSummary = async () => {
    const payload = await apiRequest<InventorySummaryPayload>("/api/admin/products/inventory/dashboard-summary?threshold=2&limit=5", {
      service: "product",
      token: accessToken,
      onUnauthorized: refreshAccessToken,
    });
    setSummary(payload.summary);
  };

  const loadOverviewList = async () => {
    const params = new URLSearchParams();
    if (selectedCategoryId) params.set("categoryId", selectedCategoryId);
    if (search) params.set("search", search);
    params.set("page", String(page));
    params.set("limit", String(PAGE_SIZE));

    const payload = await apiRequest<PaginatedResponse<InventoryDoc>>(`/api/admin/products/inventory/list?${params.toString()}`, {
      service: "product",
      token: accessToken,
      onUnauthorized: refreshAccessToken,
    });

    setItems(payload?.items || []);
    setTotal(Number(payload?.total || 0));
    setTotalPages(Math.max(1, Number(payload?.totalPages || 1)));
    setRiskPayload(null);
  };

  const loadRiskList = async (tab: Exclude<InventoryTab, "overview">) => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    params.set("page", String(page));
    params.set("limit", String(RISK_PAGE_SIZE));
    params.set("sort", sort);

    const endpoint = tab === "low-stock" ? "/api/admin/products/inventory/low-stock" : "/api/admin/products/inventory/out-of-stock";
    const payload = await apiRequest<PaginatedResponse<InventoryRiskItem>>(`${endpoint}?${params.toString()}`, {
      service: "product",
      token: accessToken,
      onUnauthorized: refreshAccessToken,
    });

    setRiskPayload(payload);
    setItems([]);
    setTotal(Number(payload?.total || 0));
    setTotalPages(Math.max(1, Number(payload?.totalPages || 1)));
  };

  useEffect(() => {
    void loadCategories();
    void loadSummary();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextSearch = searchInput.trim();
      setSearch((current) => current === nextSearch ? current : nextSearch);
      setPage((current) => (current === 1 ? current : 1));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      try {
        if (activeTab === "overview") {
          await Promise.all([loadSummary(), loadOverviewList()]);
        } else {
          await Promise.all([loadSummary(), loadRiskList(activeTab)]);
        }
        if (active) setError("");
      } catch (err) {
        if (active) setError((err as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [activeTab, selectedCategoryId, search, sort, page, accessToken, refreshAccessToken]);

  const openEditor = (item: InventoryDoc) => {
    if (!canUpdateInventory) return;
    setEditor({
      itemId: item._id,
      title: item.productTitle || item.stockKey,
      stockKey: item.stockKey,
      quantity: String(getCurrentQuantity(item)),
      reorderLevel: String(getReorderLevel(item)),
      sizeLabel: String(item.sizeLabel || ""),
      productSlug: String(item.productSlug || ""),
    });
    setEditorError("");
  };

  const closeEditor = () => {
    if (saving) return;
    setEditor(null);
    setEditorError("");
  };

  const saveItem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editor || !canUpdateInventory) return;

    const quantity = Number(editor.quantity);
    const reorderLevel = Number(editor.reorderLevel);
    const hasInvalidQuantity = !Number.isFinite(quantity) || quantity < 0;
    const hasInvalidReorderLevel = !Number.isFinite(reorderLevel) || reorderLevel < 0;

    if (hasInvalidQuantity || hasInvalidReorderLevel) {
      setEditorError(ADMIN_UI_STRINGS.inventory.saveError);
      return;
    }

    setSaving(true);
    try {
      await apiRequest(`/api/admin/products/inventory/${editor.itemId}`, {
        service: "product",
        method: "PATCH",
        token: accessToken,
        onUnauthorized: refreshAccessToken,
        body: { quantity, reorderLevel },
      });
      setEditor(null);
      setEditorError("");
      await Promise.all([loadSummary(), activeTab === "overview" ? loadOverviewList() : loadRiskList(activeTab)]);
    } catch (err) {
      setEditorError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const groupedItems = useMemo(() => {
    const groups = new Map<string, { label: string; products: Map<string, ProductInventoryRow>; lowStockCount: number }>();

    for (const item of items) {
      const groupId = String(item.categoryId || "uncategorized");
      const fallbackLabel = item.categoryId
        ? getHierarchyLabel(item.categoryId, categoryMap) || "Unlabelled category"
        : "Uncategorized";
      let group = groups.get(groupId);
      if (!group) {
        group = { label: fallbackLabel, products: new Map(), lowStockCount: 0 };
        groups.set(groupId, group);
      }

      if (isLowStock(item)) group.lowStockCount += 1;

      const productId = String(item.productId || `stock:${item.stockKey}`);
      const existingProduct = group.products.get(productId);
      const orderDetails = Array.isArray(item.orderRefs)
        ? item.orderRefs.map((orderRef) => ({ ...orderRef, stockKey: item.stockKey, sizeLabel: String(item.sizeLabel || "") }))
        : [];

      if (existingProduct) {
        existingProduct.initialQuantity += getInitialQuantity(item);
        existingProduct.currentQuantity += getCurrentQuantity(item);
        existingProduct.soldQuantity += getSoldQuantity(item);
        existingProduct.items.push(item);
        existingProduct.orderDetails.push(...orderDetails);
        if (isLowStock(item)) existingProduct.lowStockCount += 1;
        continue;
      }

      group.products.set(productId, {
        id: productId,
        title: item.productTitle || item.stockKey,
        productSlug: String(item.productSlug || ""),
        categoryId: String(item.categoryId || ""),
        initialQuantity: getInitialQuantity(item),
        currentQuantity: getCurrentQuantity(item),
        soldQuantity: getSoldQuantity(item),
        lowStockCount: isLowStock(item) ? 1 : 0,
        items: [item],
        orderDetails,
      });
    }

    return Array.from(groups.entries())
      .map(([id, group]) => ({
        id,
        label: group.label,
        lowStockCount: group.lowStockCount,
        products: Array.from(group.products.values())
          .map((product) => ({
            ...product,
            items: [...product.items].sort((left, right) => left.stockKey.localeCompare(right.stockKey)),
            orderDetails: [...product.orderDetails].sort((left, right) => {
              const leftTime = left.placedAt ? new Date(left.placedAt).getTime() : 0;
              const rightTime = right.placedAt ? new Date(right.placedAt).getTime() : 0;
              return rightTime - leftTime;
            }),
          }))
          .sort((left, right) => left.title.localeCompare(right.title)),
      }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [categoryMap, items]);

  const toggleProduct = (productId: string) => {
    setExpandedProductIds((current) =>
      current.includes(productId) ? current.filter((entry) => entry !== productId) : [...current, productId]
    );
  };

  const navigateToTab = (tab: InventoryTab) => {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "overview") params.delete("tab");
    else params.set("tab", tab);
    router.push(params.toString() ? `${pathname}?${params.toString()}` : pathname);
  };

  const summaryCards = [
    { label: ADMIN_UI_STRINGS.inventory.totalActiveProducts, value: summary?.totalActiveProducts || 0 },
    { label: ADMIN_UI_STRINGS.inventory.totalActiveVariants, value: summary?.totalActiveVariants || 0 },
    { label: ADMIN_UI_STRINGS.inventory.lowStock, value: summary?.lowStockVariantsCount || 0 },
    { label: ADMIN_UI_STRINGS.inventory.outOfStock, value: summary?.outOfStockVariantsCount || 0 },
  ];

  return (
    <ProtectedPage anyOf={["inventory:read", "product:inventory:update"]}>
      <section className="card inventory-toolbar">
        <div className="inventory-toolbar__intro">
          <div className="inventory-group__eyebrow">{ADMIN_UI_STRINGS.inventory.dashboardTabsLabel}</div>
          <h1>{ADMIN_UI_STRINGS.inventory.title}</h1>
          <p>{ADMIN_UI_STRINGS.inventory.overviewSubtitle}</p>
        </div>

        <nav className="dashboard-nav" aria-label={ADMIN_UI_STRINGS.inventory.dashboardTabsLabel}>
          {[
            { key: "overview", label: ADMIN_UI_STRINGS.inventory.overviewTab },
            { key: "low-stock", label: ADMIN_UI_STRINGS.inventory.lowStockTab },
            { key: "out-of-stock", label: ADMIN_UI_STRINGS.inventory.outOfStockTab },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={activeTab === tab.key ? "dashboard-nav__link is-active" : "dashboard-nav__link"}
              onClick={() => navigateToTab(tab.key as InventoryTab)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="inventory-toolbar__filters">
          <label className="inventory-toolbar__field">
            <span>{ADMIN_UI_STRINGS.inventory.searchLabel}</span>
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={ADMIN_UI_STRINGS.inventory.searchPlaceholder}
            />
          </label>

          {activeTab === "overview" ? (
            <label className="inventory-toolbar__field">
              <span>{ADMIN_UI_STRINGS.products.categoryLabel}</span>
              <select
                value={selectedCategoryId}
                onChange={(event) => {
                  setSelectedCategoryId(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">{ADMIN_UI_STRINGS.products.allCategories}</option>
                {categories.map((category) => (
                  <option key={category._id} value={category._id}>
                    {getHierarchyLabel(category._id, categoryMap) || category.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="inventory-toolbar__field">
              <span>{ADMIN_UI_STRINGS.inventory.sortLabel}</span>
              <select value={sort} onChange={(event) => setSort(event.target.value)}>
                {["updated_desc", "updated_asc", "stock_asc", "stock_desc", "title_asc", "title_desc"].map((value) => (
                  <option key={value} value={value}>{sortLabel(value)}</option>
                ))}
              </select>
            </label>
          )}

          <button className="secondary inventory-toolbar__action" onClick={() => {
            void loadSummary();
            if (activeTab === "overview") void loadOverviewList();
            else void loadRiskList(activeTab);
          }}>
            {ADMIN_UI_STRINGS.common.refresh}
          </button>
        </div>
      </section>

      {error ? <div className="error">{error}</div> : null}

      <section className="inventory-summary-grid">
        {summaryCards.map((card) => (
          <article key={card.label} className="card inventory-summary-card">
            <span>{card.label}</span>
            <strong>{card.value}</strong>
          </article>
        ))}
      </section>

      {loading ? <section className="card inventory-state">{ADMIN_UI_STRINGS.common.loadingInventory}</section> : null}

      {activeTab === "overview" ? (
        <>
          <section className="dashboard-grid dashboard-grid--secondary">
            <article className="card dashboard-panel">
              <header className="dashboard-panel__header">
                <div>
                  <div className="orders-detail__eyebrow">{ADMIN_UI_STRINGS.inventory.lowStockTab}</div>
                  <h2>{ADMIN_UI_STRINGS.inventory.lowStock}</h2>
                  <p className="dashboard-panel__help">{ADMIN_UI_STRINGS.inventory.lowStockRule}</p>
                </div>
                <Link href="/admin/inventory?tab=low-stock" className="dashboard-inline-link">
                  {ADMIN_UI_STRINGS.inventory.viewAllLowStock}
                </Link>
              </header>
              <div className="dashboard-panel__help">
                {ADMIN_UI_STRINGS.inventory.showingCount(summary?.lowStockVariants.length || 0, summary?.lowStockVariantsCount || 0)}
              </div>
              {!summary?.lowStockVariants.length ? (
                <div className="dashboard-empty">{ADMIN_UI_STRINGS.inventory.riskEmptyState}</div>
              ) : (
                <div className="dashboard-alert-list">
                  {summary.lowStockVariants.map((item) => (
                    <Link key={item.inventoryId} href={`/admin/inventory?tab=low-stock&search=${encodeURIComponent(item.stockKey)}`} className="dashboard-alert-list__item">
                      <div>
                        <strong>{item.productTitle}</strong>
                        <span>{item.variantSummary ? `${item.variantSummary} • ${item.stockKey}` : item.stockKey}</span>
                      </div>
                      <strong>{item.availableStock}</strong>
                    </Link>
                  ))}
                </div>
              )}
            </article>

            <article className="card dashboard-panel">
              <header className="dashboard-panel__header">
                <div>
                  <div className="orders-detail__eyebrow">{ADMIN_UI_STRINGS.inventory.outOfStockTab}</div>
                  <h2>{ADMIN_UI_STRINGS.inventory.outOfStock}</h2>
                  <p className="dashboard-panel__help">{ADMIN_UI_STRINGS.inventory.outOfStockRule}</p>
                </div>
                <Link href="/admin/inventory?tab=out-of-stock" className="dashboard-inline-link">
                  {ADMIN_UI_STRINGS.inventory.viewAllOutOfStock}
                </Link>
              </header>
              <div className="dashboard-panel__help">
                {ADMIN_UI_STRINGS.inventory.showingCount(summary?.outOfStockVariants.length || 0, summary?.outOfStockVariantsCount || 0)}
              </div>
              {!summary?.outOfStockVariants.length ? (
                <div className="dashboard-empty">{ADMIN_UI_STRINGS.inventory.riskEmptyState}</div>
              ) : (
                <div className="dashboard-alert-list">
                  {summary.outOfStockVariants.map((item) => (
                    <Link key={item.inventoryId} href={`/admin/inventory?tab=out-of-stock&search=${encodeURIComponent(item.stockKey)}`} className="dashboard-alert-list__item dashboard-alert-list__item--critical">
                      <div>
                        <strong>{item.productTitle}</strong>
                        <span>{item.variantSummary ? `${item.variantSummary} • ${item.stockKey}` : item.stockKey}</span>
                      </div>
                      <strong>{item.availableStock}</strong>
                    </Link>
                  ))}
                </div>
              )}
            </article>
          </section>

          <section className="dashboard-grid dashboard-grid--secondary">
            <article className="card dashboard-panel">
              <header className="dashboard-panel__header">
                <div>
                  <div className="orders-detail__eyebrow">{ADMIN_UI_STRINGS.inventory.summaryTitle}</div>
                  <h2>{ADMIN_UI_STRINGS.inventory.recentUpdatesTitle}</h2>
                </div>
              </header>
              {!summary?.recentUpdatedItems.length ? (
                <div className="dashboard-empty">{ADMIN_UI_STRINGS.inventory.riskEmptyState}</div>
              ) : (
                <div className="dashboard-alert-list">
                  {summary.recentUpdatedItems.map((item) => (
                    <Link key={item.inventoryId} href={`/admin/products/${encodeURIComponent(item.productId)}`} className="dashboard-alert-list__item">
                      <div>
                        <strong>{item.productTitle}</strong>
                        <span>{item.categoryName} • {item.stockKey}</span>
                      </div>
                      <span>{formatDateTime(item.updatedAt)}</span>
                    </Link>
                  ))}
                </div>
              )}
            </article>

            <article className="card dashboard-panel">
              <header className="dashboard-panel__header">
                <div>
                  <div className="orders-detail__eyebrow">{ADMIN_UI_STRINGS.inventory.summaryTitle}</div>
                  <h2>{ADMIN_UI_STRINGS.inventory.categoryRiskTitle}</h2>
                </div>
              </header>
              {!summary?.categoryRisk.length ? (
                <div className="dashboard-empty">{ADMIN_UI_STRINGS.inventory.riskEmptyState}</div>
              ) : (
                <div className="dashboard-alert-list">
                  {summary.categoryRisk.map((item) => (
                    <div key={item.categoryId} className="dashboard-alert-list__item">
                      <div>
                        <strong>{item.categoryName}</strong>
                        <span>{item.lowStockCount} low stock • {item.outOfStockCount} out of stock</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </article>
          </section>

          {!loading && !groupedItems.length ? (
            <section className="card inventory-state">{ADMIN_UI_STRINGS.inventory.emptyState}</section>
          ) : null}

          <section className="card inventory-group">
            <div className="inventory-group__header">
              <div>
                <div className="inventory-group__eyebrow">{ADMIN_UI_STRINGS.inventory.summaryTitle}</div>
                <h2>{ADMIN_UI_STRINGS.inventory.inventoryExplorerTitle}</h2>
              </div>
            </div>

            <div className="inventory-groups">
              {groupedItems.map((group) => (
                <section key={group.id} className="card inventory-group">
                  <div className="inventory-group__header">
                    <div>
                      <div className="inventory-group__eyebrow">{ADMIN_UI_STRINGS.products.categoryLabel}</div>
                      <h2>{group.label}</h2>
                    </div>
                    <div className="inventory-group__badges">
                      <span className="badge">{group.products.length} {ADMIN_UI_STRINGS.inventory.productsCount}</span>
                      {group.lowStockCount ? <span className="badge inventory-badge inventory-badge--alert">{group.lowStockCount} {ADMIN_UI_STRINGS.inventory.lowStock}</span> : null}
                    </div>
                  </div>

                  <div className="inventory-product-table">
                    <div className="inventory-product-table__head">
                      <span>{ADMIN_UI_STRINGS.inventory.productLabel}</span>
                      <span>{ADMIN_UI_STRINGS.inventory.initialQuantity}</span>
                      <span>{ADMIN_UI_STRINGS.inventory.soldQuantity}</span>
                      <span>{ADMIN_UI_STRINGS.inventory.remainingQuantity}</span>
                    </div>

                    <div className="inventory-product-table__body">
                      {group.products.map((product) => {
                        const isExpanded = expandedProductIds.includes(product.id);
                        return (
                          <article key={product.id} className="inventory-product-entry">
                            <button
                              type="button"
                              className={`inventory-product-row ${product.lowStockCount ? "inventory-product-row--alert" : ""}`}
                              onClick={() => toggleProduct(product.id)}
                            >
                              <div className="inventory-product-row__main">
                                <div className="inventory-product-row__title">
                                  <strong>{product.title}</strong>
                                  <div className="inventory-product-row__meta">
                                    {product.productSlug ? <span className="inventory-chip">{product.productSlug}</span> : null}
                                    <span className="inventory-chip">{product.items.length} {ADMIN_UI_STRINGS.inventory.skuCount}</span>
                                    {product.lowStockCount ? <span className="badge inventory-badge inventory-badge--alert">{product.lowStockCount} {ADMIN_UI_STRINGS.inventory.lowStock}</span> : null}
                                  </div>
                                </div>
                                <span className="inventory-product-row__toggle">
                                  {isExpanded ? ADMIN_UI_STRINGS.inventory.collapseRow : ADMIN_UI_STRINGS.inventory.expandRow}
                                </span>
                              </div>
                              <div className="inventory-product-row__metric"><strong>{product.initialQuantity}</strong></div>
                              <div className="inventory-product-row__metric"><strong>{product.soldQuantity}</strong></div>
                              <div className="inventory-product-row__metric"><strong>{product.currentQuantity}</strong></div>
                            </button>

                            {isExpanded ? (
                              <div className="inventory-product-detail">
                                <section className="inventory-detail-block">
                                  <div className="inventory-item-card__orders-label">{ADMIN_UI_STRINGS.inventory.stockDetailsTitle}</div>
                                  <div className="inventory-detail-table">
                                    <div className="inventory-detail-table__head inventory-detail-table__head--stock">
                                      <span>{ADMIN_UI_STRINGS.inventory.stockKeyLabel}</span>
                                      <span>{ADMIN_UI_STRINGS.inventory.sizeLabel}</span>
                                      <span>{ADMIN_UI_STRINGS.inventory.initialQuantity}</span>
                                      <span>{ADMIN_UI_STRINGS.inventory.soldQuantity}</span>
                                      <span>{ADMIN_UI_STRINGS.inventory.remainingQuantity}</span>
                                      <span>{ADMIN_UI_STRINGS.inventory.reorderLevel}</span>
                                      <span>{ADMIN_UI_STRINGS.common.action}</span>
                                    </div>
                                    <div className="inventory-detail-table__body">
                                      {product.items.map((item) => (
                                        <div key={item._id} className="inventory-detail-table__row inventory-detail-table__row--stock">
                                          <span>{item.stockKey}</span>
                                          <span>{item.sizeLabel || "-"}</span>
                                          <span>{getInitialQuantity(item)}</span>
                                          <span>{getSoldQuantity(item)}</span>
                                          <span>{getCurrentQuantity(item)}</span>
                                          <span>{getReorderLevel(item)}</span>
                                          <span>{canUpdateInventory ? <button className="secondary" onClick={() => openEditor(item)}>{ADMIN_UI_STRINGS.common.edit}</button> : "Read only"}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </section>

                                <section className="inventory-detail-block">
                                  <div className="inventory-item-card__orders-label">{ADMIN_UI_STRINGS.inventory.orderDetailsTitle}</div>
                                  {product.orderDetails.length ? (
                                    <div className="inventory-detail-table">
                                      <div className="inventory-detail-table__head inventory-detail-table__head--orders">
                                        <span>Order</span>
                                        <span>{ADMIN_UI_STRINGS.inventory.stockKeyLabel}</span>
                                        <span>{ADMIN_UI_STRINGS.inventory.sizeLabel}</span>
                                        <span>Qty</span>
                                        <span>Status</span>
                                        <span>Placed</span>
                                      </div>
                                      <div className="inventory-detail-table__body">
                                        {product.orderDetails.map((orderRef, index) => (
                                          <div key={`${product.id}-${orderRef.orderId}-${orderRef.stockKey}-${index}`} className="inventory-detail-table__row inventory-detail-table__row--orders">
                                            <span><Link href={`/admin/orders?search=${encodeURIComponent(orderRef.orderId)}`} className="inventory-order-link">{`#${orderRef.orderId.slice(-6).toUpperCase()}`}</Link></span>
                                            <span>{orderRef.stockKey}</span>
                                            <span>{orderRef.sizeLabel || "-"}</span>
                                            <span>{orderRef.quantity}</span>
                                            <span>{formatOrderStatus(orderRef)}</span>
                                            <span>{formatDateTime(orderRef.placedAt)}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="inventory-item-card__empty">{ADMIN_UI_STRINGS.inventory.noOrderDetails}</div>
                                  )}
                                </section>
                              </div>
                            ) : null}
                          </article>
                        );
                      })}
                    </div>
                  </div>
                </section>
              ))}
            </div>
          </section>
        </>
      ) : (
        <section className="card dashboard-panel">
          <header className="dashboard-panel__header">
            <div>
              <div className="orders-detail__eyebrow">{activeTab === "low-stock" ? ADMIN_UI_STRINGS.inventory.lowStockTab : ADMIN_UI_STRINGS.inventory.outOfStockTab}</div>
              <h2>{activeTab === "low-stock" ? "Low Stock Items" : "Out of Stock Items"}</h2>
              <p className="dashboard-panel__help">{ADMIN_UI_STRINGS.inventory.riskListSubtitle}</p>
            </div>
            <span className="dashboard-panel__meta">
              {ADMIN_UI_STRINGS.inventory.showingCount(riskPayload?.items.length || 0, riskPayload?.total || 0)}
            </span>
          </header>

          {!loading && !riskPayload?.items.length ? (
            <div className="dashboard-empty">{ADMIN_UI_STRINGS.inventory.riskEmptyState}</div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{ADMIN_UI_STRINGS.inventory.productLabel}</th>
                    <th>{ADMIN_UI_STRINGS.inventory.variantLabel}</th>
                    <th>{ADMIN_UI_STRINGS.inventory.stockKeyLabel}</th>
                    <th>{ADMIN_UI_STRINGS.inventory.categoryLabel}</th>
                    <th>{ADMIN_UI_STRINGS.inventory.remainingQuantity}</th>
                    <th>{ADMIN_UI_STRINGS.inventory.statusLabel}</th>
                    <th>{ADMIN_UI_STRINGS.inventory.updatedAtLabel}</th>
                    <th>{ADMIN_UI_STRINGS.common.action}</th>
                  </tr>
                </thead>
                <tbody>
                  {(riskPayload?.items || []).map((item) => (
                    <tr key={item.inventoryId}>
                      <td>{item.productTitle}</td>
                      <td>{item.variantSummary || item.sizeLabel || "-"}</td>
                      <td>{item.stockKey}</td>
                      <td>{item.categoryName}</td>
                      <td>{item.availableStock}</td>
                      <td>{statusLabel(item.status)}</td>
                      <td>{formatDateTime(item.updatedAt)}</td>
                      <td>
                        <Link href={`/admin/products/${encodeURIComponent(item.productId)}`} className="dashboard-inline-link">
                          View product
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <PaginationControls
        page={page}
        totalPages={totalPages}
        total={total}
        onPrevious={() => setPage((current) => Math.max(1, current - 1))}
        onNext={() => setPage((current) => Math.min(totalPages, current + 1))}
        previousLabel={ADMIN_UI_STRINGS.common.previous}
        nextLabel={ADMIN_UI_STRINGS.common.next}
      />

      {editor ? (
        <div className="inventory-modal-backdrop" role="presentation" onClick={closeEditor}>
          <div className="inventory-modal" role="dialog" aria-modal="true" aria-labelledby="inventory-editor-title" onClick={(event) => event.stopPropagation()}>
            <div className="inventory-modal__header">
              <div>
                <div className="inventory-group__eyebrow">{ADMIN_UI_STRINGS.inventory.editorTitle}</div>
                <h2 id="inventory-editor-title">{editor.title}</h2>
              </div>
              <button type="button" className="secondary" onClick={closeEditor} disabled={saving}>
                {ADMIN_UI_STRINGS.common.cancel}
              </button>
            </div>

            <div className="inventory-modal__meta">
              <span className="inventory-chip">{editor.stockKey}</span>
              {editor.sizeLabel ? <span className="inventory-chip">{editor.sizeLabel}</span> : null}
              {editor.productSlug ? <span className="inventory-chip">{editor.productSlug}</span> : null}
            </div>

            <form className="inventory-modal__form" onSubmit={saveItem}>
              <label>
                <span>{ADMIN_UI_STRINGS.inventory.quantityLabel}</span>
                <input type="number" min="0" step="1" value={editor.quantity} onChange={(event) => setEditor((current) => current ? { ...current, quantity: event.target.value } : current)} />
                <small>{ADMIN_UI_STRINGS.inventory.quantityHelp}</small>
              </label>

              <label>
                <span>{ADMIN_UI_STRINGS.inventory.reorderLevelLabel}</span>
                <input type="number" min="0" step="1" value={editor.reorderLevel} onChange={(event) => setEditor((current) => current ? { ...current, reorderLevel: event.target.value } : current)} />
                <small>{ADMIN_UI_STRINGS.inventory.reorderLevelHelp}</small>
              </label>

              {editorError ? <div className="error">{editorError}</div> : null}

              <div className="inventory-modal__actions">
                <button type="button" className="secondary" onClick={closeEditor} disabled={saving}>{ADMIN_UI_STRINGS.common.cancel}</button>
                <button type="submit" disabled={saving}>{saving ? `${ADMIN_UI_STRINGS.common.save}...` : ADMIN_UI_STRINGS.common.save}</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </ProtectedPage>
  );
}

export default function InventoryPage() {
  return (
    <Suspense fallback={<section className="card inventory-state">{ADMIN_UI_STRINGS.common.loadingInventory}</section>}>
      <InventoryDashboardContent />
    </Suspense>
  );
}
