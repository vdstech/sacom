"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ProtectedPage } from "@/components/ProtectedPage";
import { DataTable } from "@/components/DataTable";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/api";
import { hasAnyPermission } from "@/lib/permissions";
import {
  CategoryDefinitionConfig,
  ProductFieldDefinition,
  defaultFilterConfig,
  normalizeFilterConfig,
} from "@/lib/filterConfig";

type VariantStock = {
  stockKey?: string;
  sizeLabel?: string;
  quantity?: number;
  availableQty?: number;
  reservedQty?: number;
  damagedQty?: number;
  lostQty?: number;
  reorderLevel?: number;
};

type VariantDoc = {
  _id: string;
  price: number;
  taxRate?: number;
  priceIncludesTax?: boolean;
  discount?: {
    type?: "none" | "percent" | "flat";
    value?: number;
    label?: string;
  };
  isDefault?: boolean;
  isActive: boolean;
  images?: Array<{ url: string; alt?: string; sortOrder?: number }>;
  colors?: Array<{ name?: string; hex?: string }>;
  color?: { name?: string; hex?: string } | null;
  sizeLabel?: string;
  stock?: VariantStock[];
  details?: Record<string, unknown>;
};

type ProductDoc = {
  _id: string;
  categoryId?: string;
};

type CategoryFilterConfigPayload = {
  resolvedConfig?: CategoryDefinitionConfig;
};

type VariantWriteResponse = {
  variant: VariantDoc;
  warnings?: Array<{ message?: string }>;
  error?: string;
};

type StockRowFormState = {
  stockKey?: string;
  sizeLabel: string;
  quantity: string;
  reorderLevel: string;
};

type VariantFormState = {
  price: string;
  taxRatePercent: string;
  discountType: "none" | "percent" | "flat";
  discountValue: string;
  discountLabel: string;
  imageUrls: string;
  colorNames: string[];
  details: Record<string, unknown>;
  isDefault: boolean;
  isActive: boolean;
  stock: StockRowFormState[];
};

function parseImageUrls(raw: string) {
  return String(raw || "")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((url, index) => ({ url, alt: "", sortOrder: index }));
}

function parseLineList(value: string) {
  return String(value || "")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeToken(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function toServerError(error: unknown) {
  const e = error as Error & { message?: string };
  return String(e?.message || "Failed request");
}

function dedupeStrings(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const value of values) {
    const normalized = String(value || "").trim();
    const key = normalizeToken(normalized);
    if (!normalized || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }

  return out;
}

function parseColorTags(raw: string) {
  return dedupeStrings(
    String(raw || "")
      .split(/\n|,/)
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

function detailValueToText(value: unknown) {
  if (Array.isArray(value)) return value.join("\n");
  if (value === null || value === undefined) return "";
  return String(value);
}

function buildSizeLabels(config: CategoryDefinitionConfig) {
  if (!config.variantOptions.size.enabled) return [];
  return (config.variantOptions.size.options || []).map((option) => option.label || option.value).filter(Boolean);
}

function buildEmptyStockRows(sizeLabels: string[]) {
  if (sizeLabels.length) return [];
  return [{
    sizeLabel: "",
    quantity: "0",
    reorderLevel: "0",
  }];
}

function getVariantColors(variant: VariantDoc | null) {
  const raw = Array.isArray(variant?.colors) && variant.colors.length
    ? variant.colors
    : (variant?.color ? [variant.color] : []);
  return dedupeStrings(raw.map((entry) => String(entry?.name || "")));
}

function mapVariantToForm(variant: VariantDoc | null, config: CategoryDefinitionConfig): VariantFormState {
  const sizeLabels = buildSizeLabels(config);
  const existingStock = Array.isArray(variant?.stock) ? variant.stock : [];
  const stock = sizeLabels.length
    ? existingStock
        .map((entry) => ({
          stockKey: String(entry?.stockKey || ""),
          sizeLabel: String(entry?.sizeLabel || ""),
          quantity: String(entry?.quantity ?? 0),
          reorderLevel: String(entry?.reorderLevel ?? 0),
        }))
        .filter((entry) => !!normalizeToken(entry.sizeLabel))
    : (() => {
        const existing = existingStock[0];
        return existing
          ? [{
              stockKey: String(existing?.stockKey || ""),
              sizeLabel: String(existing?.sizeLabel || ""),
              quantity: String(existing?.quantity ?? 0),
              reorderLevel: String(existing?.reorderLevel ?? 0),
            }]
          : [];
      })();

  return {
    price: variant ? String(variant.price ?? "") : "",
    taxRatePercent: String(Math.round(Number((variant?.taxRate ?? 0.05) * 100))),
    discountType: (variant?.discount?.type || "none") as "none" | "percent" | "flat",
    discountValue: String(variant?.discount?.value ?? 0),
    discountLabel: String(variant?.discount?.label || ""),
    imageUrls: (variant?.images || []).map((item) => item.url).filter(Boolean).join("\n"),
    colorNames: getVariantColors(variant),
    details: variant?.details || {},
    isDefault: !!variant?.isDefault,
    isActive: variant ? !!variant.isActive : true,
    stock: stock.length ? stock : buildEmptyStockRows(sizeLabels),
  };
}

export default function ProductVariantsPage() {
  const { id } = useParams<{ id: string }>();
  const { accessToken, refreshAccessToken, me } = useAuth();

  const [variants, setVariants] = useState<VariantDoc[]>([]);
  const [config, setConfig] = useState<CategoryDefinitionConfig>(defaultFilterConfig());
  const [error, setError] = useState("");
  const [editingVariantId, setEditingVariantId] = useState<string | null>(null);
  const [form, setForm] = useState<VariantFormState>(() => mapVariantToForm(null, defaultFilterConfig()));
  const [sizeToAdd, setSizeToAdd] = useState("");

  const sizeEnabled = !!config.variantOptions.size.enabled;
  const sizeLabels = buildSizeLabels(config);
  const colorEnabled = !!config.variantOptions.color.enabled;
  const colorOptions = config.variantOptions.color.options || [];
  const availableSizeLabels = sizeEnabled
    ? sizeLabels.filter((label) => !form.stock.some((row) => normalizeToken(row.sizeLabel) === normalizeToken(label)))
    : [];
  const selectedSizeToAdd = availableSizeLabels.includes(sizeToAdd) ? sizeToAdd : (availableSizeLabels[0] || "");
  const systemLevel = String(me?.systemLevel || me?.user?.systemLevel || "NONE").toUpperCase();
  const isSystemBypass = systemLevel === "SUPER" || systemLevel === "ADMIN";
  const canUpdate = isSystemBypass || hasAnyPermission(me?.permissions || [], ["product:update"]);

  const load = async () => {
    try {
      const [variantPayload, productPayload] = await Promise.all([
        apiRequest<VariantDoc[]>(`/api/admin/products/${id}/variants`, {
          service: "product",
          token: accessToken,
          onUnauthorized: refreshAccessToken,
        }),
        apiRequest<ProductDoc>(`/api/admin/products/${id}`, {
          service: "product",
          token: accessToken,
          onUnauthorized: refreshAccessToken,
        }),
      ]);

      let nextConfig = defaultFilterConfig();
      if (productPayload?.categoryId) {
        const filterPayload = await apiRequest<CategoryFilterConfigPayload>(
          `/api/categories/${productPayload.categoryId}/filter-config`,
          {
            service: "catalog",
            token: accessToken,
            onUnauthorized: refreshAccessToken,
          }
        );
        nextConfig = normalizeFilterConfig(filterPayload?.resolvedConfig);
      }

      setVariants(variantPayload || []);
      setConfig(nextConfig);

      const editingVariant = (variantPayload || []).find((item) => item._id === editingVariantId) || null;
      setForm(mapVariantToForm(editingVariant, nextConfig));
      setSizeToAdd("");
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const resetForm = () => {
    setEditingVariantId(null);
    setForm(mapVariantToForm(null, config));
    setSizeToAdd("");
  };

  const startEdit = (variant: VariantDoc) => {
    if (!canUpdate) return;
    setEditingVariantId(variant._id);
    setForm(mapVariantToForm(variant, config));
    setSizeToAdd("");
    setError("");
  };

  const setDetailValue = (field: ProductFieldDefinition, value: unknown) => {
    setForm((prev) => ({
      ...prev,
      details: {
        ...prev.details,
        [field.key]: value,
      },
    }));
  };

  const onMultiEnumChange = (field: ProductFieldDefinition, event: ChangeEvent<HTMLSelectElement>) => {
    setDetailValue(
      field,
      Array.from(event.target.selectedOptions).map((option) => option.value).filter(Boolean)
    );
  };

  const updateStockRow = (index: number, patch: Partial<StockRowFormState>) => {
    setForm((prev) => ({
      ...prev,
      stock: prev.stock.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    }));
  };

  const addSizeRow = () => {
    if (!canUpdate) return;
    if (!selectedSizeToAdd) return;
    setForm((prev) => ({
      ...prev,
      stock: [
        ...prev.stock,
        {
          sizeLabel: selectedSizeToAdd,
          quantity: "0",
          reorderLevel: "0",
        },
      ],
    }));
    setSizeToAdd("");
  };

  const removeStockRow = (index: number) => {
    if (!canUpdate) return;
    setForm((prev) => ({
      ...prev,
      stock: prev.stock.filter((_, rowIndex) => rowIndex !== index),
    }));
  };

  const renderDetailField = (field: ProductFieldDefinition) => {
    const value = form.details[field.key];
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

  const buildRequestBody = () => ({
    price: Number(form.price || 0),
    taxRate: Number(form.taxRatePercent || 5) / 100,
    discount: {
      type: form.discountType,
      value: Number(form.discountValue || 0),
      label: form.discountLabel,
    },
    images: parseImageUrls(form.imageUrls),
    ...(colorEnabled ? { colors: form.colorNames.map((name) => ({ name })) } : {}),
    details: form.details,
    isDefault: form.isDefault,
    isActive: form.isActive,
    stock: form.stock.map((row) => ({
      ...(row.stockKey ? { stockKey: row.stockKey } : {}),
      sizeLabel: row.sizeLabel,
    })),
  });

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canUpdate) return;

    try {
      const body = buildRequestBody();
      const response = editingVariantId
        ? await apiRequest<VariantWriteResponse>(`/api/admin/products/${id}/variants/${editingVariantId}`, {
            service: "product",
            method: "PATCH",
            token: accessToken,
            onUnauthorized: refreshAccessToken,
            body,
          })
        : await apiRequest<VariantWriteResponse>(`/api/admin/products/${id}/variants`, {
            service: "product",
            method: "POST",
            token: accessToken,
            onUnauthorized: refreshAccessToken,
            body,
          });

      setError("");
      setEditingVariantId(null);
      setForm(mapVariantToForm(response.variant || null, config));
      await load();
      resetForm();
    } catch (err) {
      setError(toServerError(err));
    }
  };

  return (
    <ProtectedPage anyOf={["product:read", "product:update"]}>
      <section className="card">
        <div className="row" style={{ alignItems: "center", marginBottom: 12 }}>
          <h1 style={{ marginRight: "auto" }}>Variants</h1>
          {canUpdate ? <button className="secondary" type="button" onClick={resetForm}>New Variant</button> : null}
          <button className="secondary" type="button" onClick={load}>Refresh</button>
        </div>

        {error ? <div className="error">{error}</div> : null}

        <DataTable
          headers={["Image", "Colors", "Sizes", "Price", "GST", "Stock", "Default", "Active", "Action"]}
          rows={variants.map((variant) => [
            variant.images?.[0]?.url ? (
              <img
                key={`variant-image-${variant._id}`}
                src={variant.images[0].url}
                alt={variant.colors?.[0]?.name || variant.color?.name || "Variant"}
                style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 8, border: "1px solid #ddd" }}
              />
            ) : (
              <div
                key={`variant-image-empty-${variant._id}`}
                style={{ width: 44, height: 44, borderRadius: 8, border: "1px dashed #bbb", display: "grid", placeItems: "center" }}
              >
                -
              </div>
            ),
            (variant.colors || [])
              .map((entry) => entry?.name)
              .filter(Boolean)
              .join(", ") || variant.color?.name || "-",
            (variant.stock || []).map((entry) => entry.sizeLabel).filter(Boolean).join(", ") || variant.sizeLabel || "-",
            `₹${Number(variant.price || 0)}`,
            `${Math.round(Number((variant.taxRate ?? 0.05) * 100))}%`,
            (variant.stock || [])
              .map((entry) => `${entry.sizeLabel ? `${entry.sizeLabel}: ` : ""}${Number(entry.quantity || 0)}`)
              .join(", ") || "-",
            variant.isDefault ? "Yes" : "No",
            variant.isActive ? "Yes" : "No",
            canUpdate ? <button key={variant._id} className="secondary" onClick={() => startEdit(variant)}>Edit</button> : "Read only",
          ])}
        />
      </section>

      <section className="card">
        <h2>{editingVariantId ? "Edit Variant" : "Create Variant"}</h2>
        <form onSubmit={onSubmit} className="row" style={{ flexDirection: "column", alignItems: "stretch" }}>
          <fieldset disabled={!canUpdate} style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 16 }}>
          <label>
            Price
            <input
              type="number"
              min="0"
              required
              value={form.price}
              onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))}
            />
          </label>

          <label>
            GST Rate (%)
            <input
              type="number"
              min="0"
              max="99.99"
              step="0.01"
              value={form.taxRatePercent}
              onChange={(e) => setForm((prev) => ({ ...prev, taxRatePercent: e.target.value }))}
            />
          </label>

          <label>
            Discount Type
            <select
              value={form.discountType}
              onChange={(e) => setForm((prev) => ({ ...prev, discountType: e.target.value as VariantFormState["discountType"] }))}
            >
              <option value="none">none</option>
              <option value="percent">percent</option>
              <option value="flat">flat</option>
            </select>
          </label>

          <label>
            Discount Value
            <input
              type="number"
              min="0"
              value={form.discountValue}
              onChange={(e) => setForm((prev) => ({ ...prev, discountValue: e.target.value }))}
            />
          </label>

          <label>
            Discount Label
            <input
              value={form.discountLabel}
              onChange={(e) => setForm((prev) => ({ ...prev, discountLabel: e.target.value }))}
            />
          </label>

          <label>
            Image URLs (one per line)
            <textarea
              rows={5}
              value={form.imageUrls}
              onChange={(e) => setForm((prev) => ({ ...prev, imageUrls: e.target.value }))}
            />
          </label>

          {colorEnabled ? (
            colorOptions.length ? (
              <label>
                Colors
                <select
                  multiple
                  size={Math.max(Math.min(colorOptions.length, 6), 3)}
                  value={form.colorNames}
                  onChange={(e) => {
                    const selected = Array.from(e.target.selectedOptions).map((option) => option.value);
                    setForm((prev) => ({ ...prev, colorNames: dedupeStrings(selected) }));
                  }}
                >
                  {colorOptions.map((option) => (
                    <option key={option.value} value={option.label}>{option.label}</option>
                  ))}
                </select>
              </label>
            ) : (
              <label>
                Colors
                <textarea
                  rows={4}
                  value={form.colorNames.join("\n")}
                  onChange={(e) => setForm((prev) => ({ ...prev, colorNames: parseColorTags(e.target.value) }))}
                  placeholder="One color tag per line"
                />
              </label>
            )
          ) : null}

          {config.variantFieldDefinitions.length ? (
            <>
              <h3>Variant Fields</h3>
              {config.variantFieldDefinitions.map(renderDetailField)}
            </>
          ) : null}

          <h3>Stock</h3>
          <p style={{ marginTop: -8, opacity: 0.8 }}>
            Quantity and reorder controls are managed from Inventory. This page only manages size and stock-row structure.
          </p>
          {sizeEnabled ? (
            <div className="row" style={{ gap: 8, alignItems: "flex-end" }}>
              <label style={{ flex: 1, minWidth: 220 }}>
                Add Size
                <select
                  value={selectedSizeToAdd}
                  onChange={(e) => setSizeToAdd(e.target.value)}
                  disabled={!availableSizeLabels.length}
                >
                  {availableSizeLabels.length ? null : <option value="">No more sizes available</option>}
                  {availableSizeLabels.map((sizeLabel) => (
                    <option key={sizeLabel} value={sizeLabel}>{sizeLabel}</option>
                  ))}
                </select>
              </label>
              <button type="button" className="secondary" onClick={addSizeRow} disabled={!selectedSizeToAdd}>
                Add Size
              </button>
            </div>
          ) : null}

          {!form.stock.length ? (
            <div style={{ opacity: 0.75 }}>
              {sizeEnabled ? "No sizes added for this variant." : "No stock configured."}
            </div>
          ) : null}

          {form.stock.map((row, index) => (
            <div key={`${row.stockKey || "new"}-${row.sizeLabel || index}`} style={{ border: "1px solid #ddd", borderRadius: 10, padding: 16 }}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                {sizeEnabled && row.sizeLabel ? (
                  <div style={{ fontWeight: 600 }}>{row.sizeLabel}</div>
                ) : (
                  <div style={{ fontWeight: 600 }}>Stock Row</div>
                )}
                {sizeEnabled ? (
                  <button type="button" className="secondary" onClick={() => removeStockRow(index)}>
                    Remove
                  </button>
                ) : null}
              </div>
              {!sizeEnabled ? (
                <label style={{ display: "block", marginBottom: 8 }}>
                  Size
                  <input
                    value={row.sizeLabel}
                    onChange={(e) => updateStockRow(index, { sizeLabel: e.target.value })}
                  />
                </label>
              ) : null}
              <div className="row" style={{ gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                <label style={{ flex: 1, minWidth: 180 }}>
                  Available
                  <input
                    type="number"
                    value={row.quantity}
                    disabled
                    readOnly
                  />
                </label>
                <label style={{ flex: 1, minWidth: 180 }}>
                  Reorder Level
                  <input
                    type="number"
                    value={row.reorderLevel}
                    disabled
                    readOnly
                  />
                </label>
              </div>
            </div>
          ))}

          <label><input type="checkbox" checked={form.isDefault} onChange={(e) => setForm((prev) => ({ ...prev, isDefault: e.target.checked }))} /> Default variant</label>
          <label><input type="checkbox" checked={form.isActive} onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))} /> Active</label>
          </fieldset>

          <div className="row">
            {canUpdate ? <button>{editingVariantId ? "Save Variant" : "Create Variant"}</button> : null}
            {editingVariantId && canUpdate ? <button type="button" className="secondary" onClick={resetForm}>Cancel</button> : null}
          </div>
        </form>
      </section>
    </ProtectedPage>
  );
}
