"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ProtectedPage } from "@/components/ProtectedPage";
import { DataTable } from "@/components/DataTable";
import { PaginationControls } from "@/components/PaginationControls";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { hasAnyPermission } from "@/lib/permissions";
import { buildCategoryMap, getHierarchyLabel } from "@/lib/categoryHierarchy";
import { ADMIN_UI_STRINGS } from "@/lib/uiStrings";

const PAGE_SIZE = 50;

type ProductDoc = {
  _id: string;
  title: string;
  slug: string;
  isActive: boolean;
  isFeatured: boolean;
  defaultVariant?: {
    variantId?: string;
    price?: number;
    effectivePrice?: number;
    imageUrl?: string;
    colors?: Array<{ name?: string; hex?: string }>;
    sizeLabel?: string;
    discount?: {
      type?: "none" | "percent" | "flat";
      value?: number;
      label?: string;
    };
  } | null;
  colorSummary?: {
    swatches?: Array<{ name: string; hex?: string }>;
  };
  care?: {
    text?: string;
  } | null;
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

export default function ProductsPage() {
  const { accessToken, refreshAccessToken, me } = useAuth();
  const [products, setProducts] = useState<ProductDoc[]>([]);
  const [categories, setCategories] = useState<CategoryDoc[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const systemLevel = String(me?.systemLevel || me?.user?.systemLevel || "NONE").toUpperCase();
  const isSystemBypass = systemLevel === "SUPER" || systemLevel === "ADMIN";
  const permissions = me?.permissions || [];
  const canRead = isSystemBypass || hasAnyPermission(permissions, ["product:read"]);
  const canCreate = isSystemBypass || hasAnyPermission(permissions, ["product:create"]);
  const canUpdate = isSystemBypass || hasAnyPermission(permissions, ["product:update"]);
  const canDelete = isSystemBypass || hasAnyPermission(permissions, ["product:delete"]);
  const canPublish = isSystemBypass || hasAnyPermission(permissions, ["product:publish"]);
  const categoryMap = useMemo(() => buildCategoryMap(categories), [categories]);

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

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedCategoryId) params.set("categoryId", selectedCategoryId);
      params.set("page", String(page));
      params.set("limit", String(PAGE_SIZE));

      const payload = await apiRequest<PaginatedResponse<ProductDoc>>(
        `/api/admin/products${params.toString() ? `?${params.toString()}` : ""}`,
        {
          service: "product",
          token: accessToken,
          onUnauthorized: refreshAccessToken,
        }
      );
      setProducts(payload?.items || []);
      setTotal(Number(payload?.total || 0));
      setTotalPages(Math.max(1, Number(payload?.totalPages || 1)));
      setError("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    load();
  }, [selectedCategoryId, page]);

  const renderDiscount = (product: ProductDoc) => {
    const discount = product.defaultVariant?.discount;
    if (!discount) return "-";
    if (discount.label) return discount.label;
    const type = String(discount.type || "none");
    const value = Number(discount.value || 0);
    if (type === "percent" && value > 0) return `${value}% OFF`;
    if (type === "flat" && value > 0) return `₹${value} OFF`;
    return "-";
  };

  return (
    <ProtectedPage anyOf={["product:read", "product:create", "product:update", "product:delete", "product:publish"]}>
      <section className="card row" style={{ alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ marginRight: "auto" }}>{ADMIN_UI_STRINGS.products.title}</h1>
        <label style={{ minWidth: 220 }}>
          {ADMIN_UI_STRINGS.products.categoryLabel}
          <select
            value={selectedCategoryId}
            onChange={(e) => {
              setSelectedCategoryId(e.target.value);
              setPage(1);
            }}
            style={{ width: "100%" }}
          >
            <option value="">{ADMIN_UI_STRINGS.products.allCategories}</option>
            {categories.map((category) => (
              <option key={category._id} value={category._id}>{getHierarchyLabel(category._id, categoryMap) || category.name}</option>
            ))}
          </select>
        </label>
        {canCreate ? <Link href="/admin/products/new"><button>{ADMIN_UI_STRINGS.products.createProduct}</button></Link> : null}
        <button className="secondary" onClick={() => load()}>{ADMIN_UI_STRINGS.common.refresh}</button>
      </section>

      {error ? <div className="error">{error}</div> : null}
      {loading ? <div>{ADMIN_UI_STRINGS.common.loadingProducts}</div> : null}
      <DataTable
        headers={[...ADMIN_UI_STRINGS.products.headers]}
        rows={products.map((product) => [
          product.defaultVariant?.imageUrl ? (
            <img
              key={`variant-image-${product._id}`}
              src={product.defaultVariant.imageUrl}
              alt={product.defaultVariant?.colors?.[0]?.name || product.title}
              style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 8, border: "1px solid #ddd" }}
            />
          ) : (
            <div
              key={`variant-image-fallback-${product._id}`}
              style={{
                width: 44,
                height: 44,
                borderRadius: 8,
                border: "1px dashed #bbb",
                display: "grid",
                placeItems: "center",
                fontSize: 11,
                opacity: 0.7,
              }}
            >
              {ADMIN_UI_STRINGS.common.noImage}
            </div>
          ),
          product.title,
          product.slug,
          product.defaultVariant
            ? `${(product.defaultVariant.colors || []).map((entry) => entry?.name).filter(Boolean).join(", ") || "-"}${product.defaultVariant.sizeLabel ? ` / ${product.defaultVariant.sizeLabel}` : ""} | ₹${Number(product.defaultVariant.effectivePrice ?? (product.defaultVariant.price || 0))}`
            : ADMIN_UI_STRINGS.products.defaultVariantMissing,
          <div key={`colors-${product._id}`} className="row" style={{ gap: 6 }}>
            {(product.colorSummary?.swatches || []).slice(0, 5).map((swatch) => (
              <span
                key={`${product._id}-${swatch.name}`}
                title={swatch.name}
                style={{
                  display: "inline-block",
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  border: "1px solid #ccc",
                  background: swatch.hex || "#f2f2f2",
                }}
              />
            ))}
            {!product.colorSummary?.swatches?.length ? ADMIN_UI_STRINGS.products.defaultVariantMissing : null}
          </div>,
          product.care?.text || ADMIN_UI_STRINGS.products.defaultVariantMissing,
          renderDiscount(product),
          product.isFeatured ? ADMIN_UI_STRINGS.common.yes : ADMIN_UI_STRINGS.common.no,
          <StatusBadge key={`status-${product._id}`} active={!!product.isActive} />,
          <div key={product._id} className="row">
            {canRead || canUpdate ? <Link href={`/admin/products/${product._id}`}><button className="secondary">{ADMIN_UI_STRINGS.common.edit}</button></Link> : null}
            {canRead || canUpdate ? <Link href={`/admin/products/${product._id}/variants`}><button className="secondary">{ADMIN_UI_STRINGS.products.variants}</button></Link> : null}
            {canPublish ? (
              <button
                className="secondary"
                onClick={async () => {
                  await apiRequest(`/api/admin/products/${product._id}/publish`, {
                    service: "product",
                    method: "PATCH",
                    token: accessToken,
                    onUnauthorized: refreshAccessToken,
                    body: { isActive: !product.isActive },
                  });
                  load();
                }}
              >
                {product.isActive ? ADMIN_UI_STRINGS.products.unpublish : ADMIN_UI_STRINGS.products.publish}
              </button>
            ) : null}
            {canDelete ? (
              <button
                className="danger"
                onClick={async () => {
                  const ok = window.confirm(ADMIN_UI_STRINGS.products.deleteConfirm(product.title));
                  if (!ok) return;
                  try {
                    await apiRequest(`/api/admin/products/${product._id}`, {
                      service: "product",
                      method: "DELETE",
                      token: accessToken,
                      onUnauthorized: refreshAccessToken,
                    });
                    if (products.length === 1 && page > 1) {
                      setPage(page - 1);
                      return;
                    }
                    load();
                  } catch (err) {
                    setError((err as Error).message);
                  }
                }}
              >
                Delete
              </button>
            ) : null}
          </div>,
        ])}
      />
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
