"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ProtectedPage } from "@/components/ProtectedPage";
import { DataTable } from "@/components/DataTable";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";

type ProductDoc = {
  _id: string;
  title: string;
  slug: string;
  isActive: boolean;
  isFeatured: boolean;
  colorSummary?: {
    swatches?: Array<{ name: string; hex?: string }>;
  };
};

export default function ProductsPage() {
  const { accessToken, refreshAccessToken } = useAuth();
  const [products, setProducts] = useState<ProductDoc[]>([]);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const payload = await apiRequest<ProductDoc[]>("/api/admin/products", {
        service: "product",
        token: accessToken,
        onUnauthorized: refreshAccessToken,
      });
      setProducts(payload || []);
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <ProtectedPage anyOf={["product:read", "product:write", "product:delete", "product:publish"]}>
      <section className="card row">
        <h1 style={{ marginRight: "auto" }}>Products</h1>
        <Link href="/admin/products/new"><button>Create Product</button></Link>
        <button className="secondary" onClick={load}>Refresh</button>
      </section>
      {error ? <div className="error">{error}</div> : null}
      <DataTable
        headers={["Title", "Slug", "Colors", "Featured", "Status", "Actions"]}
        rows={products.map((product) => [
          product.title,
          product.slug,
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
          </div>,
        ])}
      />
    </ProtectedPage>
  );
}
