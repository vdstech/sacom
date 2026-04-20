"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ProtectedPage } from "@/components/ProtectedPage";
import { DataTable } from "@/components/DataTable";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { hasAnyPermission } from "@/lib/permissions";

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
};

export default function ProductsPage() {
  const { accessToken, refreshAccessToken, me } = useAuth();
  const [products, setProducts] = useState<ProductDoc[]>([]);
  const [categories, setCategories] = useState<CategoryDoc[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const canDelete = hasAnyPermission(me?.permissions || [], ["product:delete"]);

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

      const payload = await apiRequest<ProductDoc[]>(
        `/api/admin/products${params.toString() ? `?${params.toString()}` : ""}`,
        {
          service: "product",
          token: accessToken,
          onUnauthorized: refreshAccessToken,
        }
      );
      setProducts(payload || []);
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
  }, [selectedCategoryId]);

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
    <ProtectedPage anyOf={["product:read", "product:write", "product:delete", "product:publish"]}>
      <section className="card row" style={{ alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ marginRight: "auto" }}>Products</h1>
        <label style={{ minWidth: 220 }}>
          Category
          <select
            value={selectedCategoryId}
            onChange={(e) => setSelectedCategoryId(e.target.value)}
            style={{ width: "100%" }}
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category._id} value={category._id}>{category.name}</option>
            ))}
          </select>
        </label>
        <Link href="/admin/products/new"><button>Create Product</button></Link>
        <button className="secondary" onClick={() => load()}>Refresh</button>
      </section>

      {error ? <div className="error">{error}</div> : null}
      {loading ? <div>Loading products...</div> : null}
      <DataTable
        headers={["Variant", "Title", "Slug", "Default Variant", "Colors", "Care", "Discount", "Featured", "Status", "Actions"]}
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
              no image
            </div>
          ),
          product.title,
          product.slug,
          product.defaultVariant
            ? `${(product.defaultVariant.colors || []).map((entry) => entry?.name).filter(Boolean).join(", ") || "-"}${product.defaultVariant.sizeLabel ? ` / ${product.defaultVariant.sizeLabel}` : ""} | ₹${Number(product.defaultVariant.effectivePrice ?? (product.defaultVariant.price || 0))}`
            : "-",
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
            {!product.colorSummary?.swatches?.length ? "-" : null}
          </div>,
          product.care?.text || "-",
          renderDiscount(product),
          product.isFeatured ? "Yes" : "No",
          <StatusBadge key={`status-${product._id}`} active={!!product.isActive} />,
          <div key={product._id} className="row">
            <Link href={`/admin/products/${product._id}`}><button className="secondary">Edit</button></Link>
            <Link href={`/admin/products/${product._id}/variants`}><button className="secondary">Variants</button></Link>
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
              {product.isActive ? "Unpublish" : "Publish"}
            </button>
            {canDelete ? (
              <button
                className="danger"
                onClick={async () => {
                  const ok = window.confirm(`Delete product "${product.title}"? This will permanently delete product, variants and stock.`);
                  if (!ok) return;
                  try {
                    await apiRequest(`/api/admin/products/${product._id}`, {
                      service: "product",
                      method: "DELETE",
                      token: accessToken,
                      onUnauthorized: refreshAccessToken,
                    });
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
    </ProtectedPage>
  );
}
