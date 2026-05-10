"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ProtectedPage } from "@/components/ProtectedPage";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/api";
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

export default function NewProductPage() {
  const router = useRouter();
  const { accessToken, refreshAccessToken } = useAuth();
  const [categories, setCategories] = useState<CategoryDoc[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [categoryConfig, setCategoryConfig] = useState<CategoryDefinitionConfig>(defaultFilterConfig());
  const [details, setDetails] = useState<Record<string, unknown>>({});
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  useEffect(() => {
    apiRequest<CategoryDoc[]>("/api/categories", {
      service: "catalog",
      token: accessToken,
      onUnauthorized: refreshAccessToken,
    })
      .then((payload) => setCategories(payload || []))
      .catch((e) => setError((e as Error).message));
  }, []);

  useEffect(() => {
    if (!selectedCategoryId) {
      setCategoryConfig(defaultFilterConfig());
      setDetails({});
      return;
    }

    apiRequest<CategoryFilterConfigPayload>(`/api/categories/${selectedCategoryId}/filter-config`, {
      service: "catalog",
      token: accessToken,
      onUnauthorized: refreshAccessToken,
    })
      .then((payload) => setCategoryConfig(normalizeFilterConfig(payload?.resolvedConfig)))
      .catch((e) => setError((e as Error).message));
  }, [selectedCategoryId, accessToken, refreshAccessToken]);

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

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);

    try {
      await apiRequest("/api/admin/products", {
        service: "product",
        method: "POST",
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
      router.push("/admin/products");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <ProtectedPage anyOf={["product:create"]}>
      <section className="card">
        <h1>Create Product</h1>
        <form onSubmit={onSubmit} className="row" style={{ flexDirection: "column", alignItems: "stretch" }}>
          <label>
            Title
            <input
              name="title"
              required
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
            />
          </label>
          <label>
            Slug
            <div className="row" style={{ gap: 8 }}>
              <input
                name="slug"
                required
                value={slug}
                onChange={(e) => onSlugChange(e.target.value)}
                style={{ flex: 1 }}
              />
              <button type="button" className="secondary" onClick={resetSlugToAuto}>
                Reset Auto
              </button>
            </div>
            <small style={{ opacity: 0.75 }}>Slug auto-generated; duplicates are auto-suffixed.</small>
          </label>
          <label>Description<textarea name="description" /></label>
          <label>Short Description<input name="shortDescription" /></label>
          <label>Currency<input name="currency" defaultValue="INR" /></label>
          <label>Tags (comma separated)<input name="tags" /></label>
          <label>Image URLs (one per line)<textarea name="imageUrls" rows={5} placeholder="https://.../image1.jpg" /></label>

          <label>
            Category
            <select
              name="categoryId"
              required
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
            >
              <option value="">Select category</option>
              {categories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
          </label>

          {categoryConfig.productFieldDefinitions.length ? (
            <>
              <h3>Category Fields</h3>
              {categoryConfig.productFieldDefinitions.map(renderDetailField)}
            </>
          ) : null}

          <h3>Shipping</h3>
          <label>Shipping Text<textarea name="shippingText" rows={6} defaultValue={DEFAULT_SHIPPING_TEXT} /></label>

          <h3>Care</h3>
          <label>Care Text<textarea name="careText" rows={4} placeholder="Dry clean only" /></label>

          <h3>Return Policy</h3>
          <label>Return And Exchange Text<textarea name="returnPolicyText" rows={8} defaultValue={DEFAULT_RETURN_POLICY_TEXT} /></label>
          <label><input type="checkbox" name="returnable" defaultChecked={DEFAULT_RETURNABLE} /> Returnable</label>
          <label>Eligible Exchange Days<input type="number" min="0" name="windowDays" defaultValue={DEFAULT_RETURN_WINDOW_DAYS} /></label>

          <label><input type="checkbox" name="isActive" defaultChecked /> Active</label>
          <label><input type="checkbox" name="isFeatured" /> Featured</label>
          {error ? <div className="error">{error}</div> : null}
          <button>Create Product</button>
        </form>
      </section>
    </ProtectedPage>
  );
}
