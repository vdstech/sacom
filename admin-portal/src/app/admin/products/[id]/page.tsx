"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ProtectedPage } from "@/components/ProtectedPage";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/api";
import { hasAnyPermission } from "@/lib/permissions";
import {
  CategoryDefinitionConfig,
  ProductFieldDefinition,
  defaultFilterConfig,
  normalizeFilterConfig,
} from "@/lib/filterConfig";
import {
  DEFAULT_RETURN_POLICY_TEXT,
  DEFAULT_RETURNABLE,
  DEFAULT_RETURN_WINDOW_DAYS,
  DEFAULT_SHIPPING_TEXT,
} from "@/lib/productMetadataDefaults";

type ProductDoc = {
  _id: string;
  title: string;
  slug: string;
  description: string;
  shortDescription: string;
  categoryId: string;
  isActive: boolean;
  isFeatured: boolean;
  tags?: string[];
  currency?: string;
  images?: Array<{ url: string; alt?: string; sortOrder?: number }>;
  shipping?: {
    text?: string;
  };
  care?: {
    text?: string;
  };
  returnPolicy?: {
    text?: string;
    returnable?: boolean;
    windowDays?: number;
  };
  details?: Record<string, unknown>;
};

type CategoryDoc = { _id: string; name: string };

type CategoryFilterConfigPayload = {
  resolvedConfig?: CategoryDefinitionConfig;
};

function parseCsv(value: FormDataEntryValue | null) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseLineList(value: string) {
  return String(value || "")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseImageUrls(raw: string) {
  return parseLineList(raw).map((url, index) => ({ url, alt: "", sortOrder: index }));
}

function slugify(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function detailValueToText(value: unknown) {
  if (Array.isArray(value)) return value.join("\n");
  if (value === null || value === undefined) return "";
  return String(value);
}

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { accessToken, refreshAccessToken, me } = useAuth();
  const [product, setProduct] = useState<ProductDoc | null>(null);
  const [categories, setCategories] = useState<CategoryDoc[]>([]);
  const [categoryConfig, setCategoryConfig] = useState<CategoryDefinitionConfig>(defaultFilterConfig());
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [details, setDetails] = useState<Record<string, unknown>>({});
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const canDelete = hasAnyPermission(me?.permissions || [], ["product:delete"]);

  const loadCategories = async () => {
    const payload = await apiRequest<CategoryDoc[]>("/api/categories", {
      service: "catalog",
      token: accessToken,
      onUnauthorized: refreshAccessToken,
    });
    setCategories(payload || []);
  };

  const loadCategoryConfig = async (categoryId: string) => {
    if (!categoryId) {
      setCategoryConfig(defaultFilterConfig());
      return;
    }

    const payload = await apiRequest<CategoryFilterConfigPayload>(`/api/categories/${categoryId}/filter-config`, {
      service: "catalog",
      token: accessToken,
      onUnauthorized: refreshAccessToken,
    });
    setCategoryConfig(normalizeFilterConfig(payload?.resolvedConfig));
  };

  const load = async () => {
    try {
      const payload = await apiRequest<ProductDoc>(`/api/admin/products/${id}`, {
        service: "product",
        token: accessToken,
        onUnauthorized: refreshAccessToken,
      });
      setProduct(payload);
      setTitle(String(payload?.title || ""));
      setSlug(String(payload?.slug || ""));
      setSlugManuallyEdited(false);
      setSelectedCategoryId(String(payload?.categoryId || ""));
      setDetails(payload?.details || {});
      setError("");
      await Promise.all([
        loadCategories(),
        loadCategoryConfig(String(payload?.categoryId || "")),
      ]);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const imageUrlsDefault = useMemo(
    () => (product?.images || []).map((image) => image.url).filter(Boolean).join("\n"),
    [product]
  );

  const shippingDefault = useMemo(
    () => String(product?.shipping?.text || "").trim() || DEFAULT_SHIPPING_TEXT,
    [product]
  );
  const returnPolicyTextDefault = useMemo(
    () => String(product?.returnPolicy?.text || "").trim() || DEFAULT_RETURN_POLICY_TEXT,
    [product]
  );
  const hasSavedReturnPolicyText = useMemo(
    () => !!String(product?.returnPolicy?.text || "").trim(),
    [product]
  );
  const returnableDefault = useMemo(
    () => hasSavedReturnPolicyText ? !!product?.returnPolicy?.returnable : DEFAULT_RETURNABLE,
    [hasSavedReturnPolicyText, product]
  );
  const returnWindowDaysDefault = useMemo(
    () => hasSavedReturnPolicyText
      ? Number(product?.returnPolicy?.windowDays || 0)
      : DEFAULT_RETURN_WINDOW_DAYS,
    [hasSavedReturnPolicyText, product]
  );

  const onTitleChange = (value: string) => {
    setTitle(value);
    if (!slugManuallyEdited) {
      setSlug(slugify(value));
    }
  };

  const onSlugChange = (value: string) => {
    setSlug(value);
    setSlugManuallyEdited(true);
  };

  const resetSlugToAuto = () => {
    setSlug(slugify(title));
    setSlugManuallyEdited(false);
  };

  const setDetailValue = (field: ProductFieldDefinition, value: unknown) => {
    setDetails((prev) => ({
      ...prev,
      [field.key]: value,
    }));
  };

  const onMultiEnumChange = (field: ProductFieldDefinition, event: ChangeEvent<HTMLSelectElement>) => {
    setDetailValue(
      field,
      Array.from(event.target.selectedOptions).map((option) => option.value).filter(Boolean)
    );
  };

  const onCategoryChange = async (categoryId: string) => {
    setSelectedCategoryId(categoryId);
    try {
      await loadCategoryConfig(categoryId);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const renderDetailField = (field: ProductFieldDefinition) => {
    const value = details[field.key];
    const commonLabel = (
      <>
        {field.label}
        {field.required ? " *" : ""}
      </>
    );

    if (field.type === "boolean") {
      return (
        <label key={field.key}>
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => setDetailValue(field, e.target.checked)}
          />{" "}
          {commonLabel}
        </label>
      );
    }

    if (field.type === "number") {
      return (
        <label key={field.key}>
          {commonLabel}
          <input
            type="number"
            value={value === undefined || value === null ? "" : String(value)}
            onChange={(e) => setDetailValue(field, e.target.value === "" ? "" : Number(e.target.value))}
          />
        </label>
      );
    }

    if (field.type === "enum" && field.multiValue) {
      return (
        <label key={field.key}>
          {commonLabel}
          <select
            multiple
            value={Array.isArray(value) ? value.map((item) => String(item)) : []}
            onChange={(e) => onMultiEnumChange(field, e)}
            style={{ minHeight: 120 }}
          >
            {field.options.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      );
    }

    if (field.type === "enum") {
      return (
        <label key={field.key}>
          {commonLabel}
          <select
            value={String(value || "")}
            onChange={(e) => setDetailValue(field, e.target.value)}
          >
            <option value="">Select</option>
            {field.options.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      );
    }

    if (field.multiValue) {
      return (
        <label key={field.key}>
          {commonLabel}
          <textarea
            rows={4}
            value={detailValueToText(value)}
            onChange={(e) => setDetailValue(field, parseLineList(e.target.value))}
            placeholder="One value per line"
          />
        </label>
      );
    }

    return (
      <label key={field.key}>
        {commonLabel}
        <input
          value={detailValueToText(value)}
          onChange={(e) => setDetailValue(field, e.target.value)}
        />
      </label>
    );
  };

  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!product) return;

    const form = new FormData(e.currentTarget);

    await apiRequest(`/api/admin/products/${id}`, {
      service: "product",
      method: "PUT",
      token: accessToken,
      onUnauthorized: refreshAccessToken,
      body: {
        title,
        slug,
        description: String(form.get("description") || ""),
        shortDescription: String(form.get("shortDescription") || ""),
        categoryId: selectedCategoryId,
        currency: String(form.get("currency") || "INR"),
        tags: parseCsv(form.get("tags")),
        images: parseImageUrls(String(form.get("imageUrls") || "")),
        shipping: {
          text: String(form.get("shippingText") || ""),
        },
        care: {
          text: String(form.get("careText") || ""),
        },
        returnPolicy: {
          text: String(form.get("returnPolicyText") || ""),
          returnable: form.get("returnable") === "on",
          windowDays: Number(form.get("windowDays") || 0),
        },
        details,
        isActive: form.get("isActive") === "on",
        isFeatured: form.get("isFeatured") === "on",
      },
    });

    load();
  };

  return (
    <ProtectedPage anyOf={["product:read", "product:write", "product:delete"]}>
      <section className="card">
        <h1>Product Detail</h1>
        {error ? <div className="error">{error}</div> : null}
        {!product ? <div>Loading...</div> : (
          <form onSubmit={save} className="row" style={{ flexDirection: "column", alignItems: "stretch" }}>
            <label>
              Title
              <input
                name="title"
                value={title}
                onChange={(e) => onTitleChange(e.target.value)}
                required
              />
            </label>
            <label>
              Slug
              <div className="row" style={{ gap: 8 }}>
                <input
                  name="slug"
                  value={slug}
                  onChange={(e) => onSlugChange(e.target.value)}
                  required
                  style={{ flex: 1 }}
                />
                <button type="button" className="secondary" onClick={resetSlugToAuto}>
                  Reset Auto
                </button>
              </div>
            </label>
            <label>Description<textarea name="description" defaultValue={product.description || ""} /></label>
            <label>Short Description<input name="shortDescription" defaultValue={product.shortDescription || ""} /></label>
            <label>Currency<input name="currency" defaultValue={product.currency || "INR"} /></label>
            <label>Tags (comma separated)<input name="tags" defaultValue={(product.tags || []).join(", ")} /></label>
            <label>Image URLs (one per line)<textarea name="imageUrls" rows={5} defaultValue={imageUrlsDefault} /></label>

            <label>
              Category
              <select
                value={selectedCategoryId}
                onChange={(e) => onCategoryChange(e.target.value)}
                required
              >
                <option value="">Select category</option>
                {categories.map((category) => (
                  <option key={category._id} value={category._id}>{category.name}</option>
                ))}
              </select>
            </label>

            {categoryConfig.productFieldDefinitions.length ? (
              <>
                <h3>Category Fields</h3>
                {categoryConfig.productFieldDefinitions.map(renderDetailField)}
              </>
            ) : null}

            <h3>Shipping</h3>
            <label>Shipping Text<textarea name="shippingText" rows={6} defaultValue={shippingDefault} /></label>

            <h3>Care</h3>
            <label>Care Text<textarea name="careText" rows={4} defaultValue={product.care?.text || ""} /></label>

            <h3>Return Policy</h3>
            <label>Return And Exchange Text<textarea name="returnPolicyText" rows={8} defaultValue={returnPolicyTextDefault} /></label>
            <label><input type="checkbox" name="returnable" defaultChecked={returnableDefault} /> Returnable</label>
            <label>Eligible Exchange Days<input type="number" min="0" name="windowDays" defaultValue={returnWindowDaysDefault} /></label>

            <label><input type="checkbox" name="isActive" defaultChecked={!!product.isActive} /> Active</label>
            <label><input type="checkbox" name="isFeatured" defaultChecked={!!product.isFeatured} /> Featured</label>
            <div className="row">
              <button>Save</button>
              {canDelete ? (
                <button
                  type="button"
                  className="danger"
                  onClick={async () => {
                    const ok = window.confirm(`Delete product "${product.title}"? This will permanently delete product, variants and stock.`);
                    if (!ok) return;
                    try {
                      await apiRequest(`/api/admin/products/${id}`, {
                        service: "product",
                        method: "DELETE",
                        token: accessToken,
                        onUnauthorized: refreshAccessToken,
                      });
                      router.push("/admin/products");
                    } catch (err) {
                      setError((err as Error).message);
                    }
                  }}
                >
                  Delete
                </button>
              ) : null}
            </div>
          </form>
        )}
      </section>
    </ProtectedPage>
  );
}
