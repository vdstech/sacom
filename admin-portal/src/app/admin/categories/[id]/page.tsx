"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ProtectedPage } from "@/components/ProtectedPage";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/api";
import {
  buildHierarchyTree,
  getDescendantIds,
  type CategoryTreeNode,
  type CategoryHierarchyNode,
} from "@/lib/categoryHierarchy";
import {
  MAX_PRODUCT_FIELDS,
  type CategoryDefinitionConfig,
  type ProductFieldDefinition,
  type FieldOption,
  defaultFilterConfig,
  normalizeFieldKey,
  normalizeFilterConfig,
  normalizeOptions,
  buildFilterConfigValidationErrors,
  buildFilterConfigValidationWarnings,
} from "@/lib/filterConfig";

type CategoryDoc = CategoryHierarchyNode & {
  slug: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
  filterConfig?: unknown;
};

type ProductFieldDraft = ProductFieldDefinition & {
  optionText: string;
};

function slugify(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function optionsToText(options: FieldOption[]) {
  return (options || [])
    .filter((option) => option.enabled)
    .map((option) => option.label || option.value)
    .join(", ");
}

function parseOptionsText(text: string): FieldOption[] {
  return normalizeOptions(
    String(text || "")
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

function toFieldDraft(field: ProductFieldDefinition): ProductFieldDraft {
  return {
    ...field,
    optionText: optionsToText(field.options),
  };
}

function newField(index: number): ProductFieldDraft {
  return {
    key: `field_${index + 1}`,
    label: "",
    type: "text",
    required: false,
    multiValue: false,
    options: [],
    sortOrder: index,
    optionText: "",
  };
}

function toConfig(
  productDrafts: ProductFieldDraft[],
  variantDrafts: ProductFieldDraft[],
  sizeOptionsText: string,
  colorOptionsText: string,
  sizeEnabled: boolean,
  colorEnabled: boolean
): CategoryDefinitionConfig {
  const base = defaultFilterConfig();
  const toFieldConfig = (draft: ProductFieldDraft, index: number) => ({
    key: normalizeFieldKey(draft.key),
    label: String(draft.label || "").trim() || normalizeFieldKey(draft.key),
    type: draft.type,
    required: !!draft.required,
    multiValue: (draft.type === "text" || draft.type === "enum") ? !!draft.multiValue : false,
    options: draft.type === "enum" ? parseOptionsText(draft.optionText) : [],
    sortOrder: index,
  });
  base.productFieldDefinitions = productDrafts.map(toFieldConfig);
  base.variantFieldDefinitions = variantDrafts.map(toFieldConfig);
  base.variantOptions = {
    size: { enabled: !!sizeEnabled, options: parseOptionsText(sizeOptionsText) },
    color: { enabled: !!colorEnabled, options: parseOptionsText(colorOptionsText) },
  };
  return normalizeFilterConfig(base);
}

export default function CategoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { accessToken, refreshAccessToken } = useAuth();

  const [category, setCategory] = useState<CategoryDoc | null>(null);
  const [categories, setCategories] = useState<CategoryDoc[]>([]);
  const [error, setError] = useState("");
  const [selectedParent, setSelectedParent] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [sortOrder, setSortOrder] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  const [productFieldDrafts, setProductFieldDrafts] = useState<ProductFieldDraft[]>([]);
  const [variantFieldDrafts, setVariantFieldDrafts] = useState<ProductFieldDraft[]>([]);
  const [sizeEnabled, setSizeEnabled] = useState(false);
  const [sizeOptionsText, setSizeOptionsText] = useState("");
  const [colorEnabled, setColorEnabled] = useState(false);
  const [colorOptionsText, setColorOptionsText] = useState("");

  const load = async () => {
    try {
      const [categoryPayload, categoriesPayload] = await Promise.all([
        apiRequest<CategoryDoc>(`/api/categories/${id}`, {
          service: "catalog",
          token: accessToken,
          onUnauthorized: refreshAccessToken,
        }),
        apiRequest<CategoryDoc[]>("/api/categories", {
          service: "catalog",
          token: accessToken,
          onUnauthorized: refreshAccessToken,
        }),
      ]);

      const list = categoriesPayload || [];
      const normalizedConfig = normalizeFilterConfig(categoryPayload.filterConfig || {});

      setCategory(categoryPayload);
      setCategories(list);
      setSelectedParent(categoryPayload.parent || "");
      setName(categoryPayload.name || "");
      setSlug(categoryPayload.slug || "");
      setDescription(categoryPayload.description || "");
      setSortOrder(Number(categoryPayload.sortOrder || 0));
      setIsActive(!!categoryPayload.isActive);
      setSlugManuallyEdited(false);
      setProductFieldDrafts((normalizedConfig.productFieldDefinitions || []).map(toFieldDraft));
      setVariantFieldDrafts((normalizedConfig.variantFieldDefinitions || []).map(toFieldDraft));
      setSizeEnabled(!!normalizedConfig.variantOptions.size.enabled);
      setSizeOptionsText(optionsToText(normalizedConfig.variantOptions.size.options));
      setColorEnabled(!!normalizedConfig.variantOptions.color.enabled);
      setColorOptionsText(optionsToText(normalizedConfig.variantOptions.color.options));

      const rootParents = new Set<string>();
      for (const item of list) {
        if (!item.parent) rootParents.add(item._id);
      }
      setExpandedIds(rootParents);
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const blockedParents = useMemo(() => {
    if (!category) return new Set<string>();
    const blocked = getDescendantIds(category._id, categories);
    blocked.add(category._id);
    return blocked;
  }, [category, categories]);

  const selectableCategories = useMemo(
    () => categories.filter((item) => !blockedParents.has(item._id)),
    [categories, blockedParents]
  );
  const tree = useMemo(() => buildHierarchyTree(selectableCategories), [selectableCategories]);
  const selectableIds = useMemo(() => new Set(selectableCategories.map((item) => item._id)), [selectableCategories]);
  const selectedParentSafe = useMemo(() => {
    if (!selectedParent) return "";
    return selectableIds.has(selectedParent) ? selectedParent : "";
  }, [selectedParent, selectableIds]);

  const draftConfig = useMemo(
    () => toConfig(productFieldDrafts, variantFieldDrafts, sizeOptionsText, colorOptionsText, sizeEnabled, colorEnabled),
    [productFieldDrafts, variantFieldDrafts, sizeOptionsText, colorOptionsText, sizeEnabled, colorEnabled]
  );
  const validationErrors = useMemo(() => buildFilterConfigValidationErrors(draftConfig), [draftConfig]);
  const validationWarnings = useMemo(() => buildFilterConfigValidationWarnings(draftConfig), [draftConfig]);

  const toggleExpanded = (nodeId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const onNameChange = (value: string) => {
    setName(value);
    if (!slugManuallyEdited) setSlug(slugify(value));
  };

  const onSlugChange = (value: string) => {
    setSlug(value);
    setSlugManuallyEdited(true);
  };

  const resetSlugToAuto = () => {
    setSlug(slugify(name));
    setSlugManuallyEdited(false);
  };

  const addField = (target: "product" | "variant") => {
    const setter = target === "product" ? setProductFieldDrafts : setVariantFieldDrafts;
    setter((prev) => prev.length >= MAX_PRODUCT_FIELDS ? prev : [...prev, newField(prev.length)]);
  };

  const removeField = (target: "product" | "variant", index: number) => {
    const setter = target === "product" ? setProductFieldDrafts : setVariantFieldDrafts;
    setter((prev) => prev.filter((_, idx) => idx !== index));
  };

  const updateField = (target: "product" | "variant", index: number, patch: Partial<ProductFieldDraft>) => {
    const setter = target === "product" ? setProductFieldDrafts : setVariantFieldDrafts;
    setter((prev) => prev.map((field, idx) => {
      if (idx !== index) return field;
      const next: ProductFieldDraft = {
        ...field,
        ...patch,
        key: patch.key !== undefined ? normalizeFieldKey(patch.key) : field.key,
      };
      if (next.type !== "enum") {
        next.multiValue = next.type === "text" ? next.multiValue : false;
        next.optionText = "";
      }
      if (next.type === "boolean" || next.type === "number") next.multiValue = false;
      return next;
    }));
  };

  const renderFieldEditor = (field: ProductFieldDraft, index: number, target: "product" | "variant") => (
    <div key={`${target}-field-${index}`} className="card" style={{ display: "grid", gap: 8 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <strong>{field.label || field.key || `Field ${index + 1}`}</strong>
        <button type="button" className="danger" onClick={() => removeField(target, index)}>Remove</button>
      </div>

      <div className="grid-two">
        <label>
          Key
          <input value={field.key} onChange={(e) => updateField(target, index, { key: e.target.value })} placeholder="fabric" />
        </label>
        <label>
          Label
          <input value={field.label} onChange={(e) => updateField(target, index, { label: e.target.value })} placeholder="Fabric" />
        </label>
        <label>
          Type
          <select value={field.type} onChange={(e) => updateField(target, index, { type: e.target.value as ProductFieldDefinition["type"] })}>
            <option value="text">text</option>
            <option value="enum">enum</option>
            <option value="number">number</option>
            <option value="boolean">boolean</option>
          </select>
        </label>
        <label>
          <input type="checkbox" checked={field.required} onChange={(e) => updateField(target, index, { required: e.target.checked })} />
          Required
        </label>
        {(field.type === "text" || field.type === "enum") ? (
          <label>
            <input type="checkbox" checked={field.multiValue} onChange={(e) => updateField(target, index, { multiValue: e.target.checked })} />
            Multi Value
          </label>
        ) : <div />}
      </div>

      {field.type === "enum" ? (
        <label>
          Options (comma or newline separated)
          <textarea
            rows={3}
            value={field.optionText}
            onChange={(e) => updateField(target, index, { optionText: e.target.value })}
            placeholder="cotton, silk, georgette"
          />
        </label>
      ) : null}
    </div>
  );

  const renderTreeNode = (node: CategoryTreeNode) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedIds.has(node.id);
    const isSelected = selectedParentSafe === node.id;

    return (
      <div key={node.id}>
        <div
          className="row"
          style={{
            justifyContent: "space-between",
            alignItems: "center",
            padding: "6px 8px",
            marginLeft: `${node.depth * 14}px`,
            borderRadius: 8,
            background: isSelected ? "rgba(34, 197, 94, 0.15)" : "transparent",
          }}
        >
          <div className="row" style={{ alignItems: "center", gap: 8 }}>
            {hasChildren ? (
              <button
                type="button"
                className="secondary"
                style={{ padding: "2px 8px", minWidth: 28 }}
                onClick={() => toggleExpanded(node.id)}
                aria-label={isExpanded ? "Collapse" : "Expand"}
              >
                {isExpanded ? "-" : "+"}
              </button>
            ) : (
              <span style={{ width: 28, display: "inline-block", opacity: 0.45 }}>•</span>
            )}
            <span>{node.name}</span>
          </div>
          <button type="button" className={isSelected ? "" : "secondary"} onClick={() => setSelectedParent(node.id)}>
            {isSelected ? "Selected" : "Select Parent"}
          </button>
        </div>
        {hasChildren && isExpanded ? node.children.map(renderTreeNode) : null}
      </div>
    );
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (validationErrors.length) {
      setError(validationErrors.join("; "));
      return;
    }

    try {
      await apiRequest(`/api/categories/${id}`, {
        service: "catalog",
        method: "PUT",
        token: accessToken,
        onUnauthorized: refreshAccessToken,
        body: {
          name,
          slug,
          description,
          sortOrder: Number(sortOrder || 0),
          parent: selectedParentSafe || null,
          isActive,
          filterConfig: draftConfig,
        },
      });
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <ProtectedPage anyOf={["category:read", "category:write", "category:delete"]}>
      <section className="card">
        <h1>Category Detail</h1>
        {error ? <div className="error">{error}</div> : null}
        {!category ? (
          <div>Loading...</div>
        ) : (
          <form onSubmit={onSubmit} className="row" style={{ flexDirection: "column", alignItems: "stretch" }}>
            <label>
              Name
              <input value={name} onChange={(e) => onNameChange(e.target.value)} required />
            </label>
            <label>
              Slug
              <div className="row" style={{ gap: 8 }}>
                <input required value={slug} onChange={(e) => onSlugChange(e.target.value)} style={{ flex: 1 }} />
                <button type="button" className="secondary" onClick={resetSlugToAuto}>Reset Auto</button>
              </div>
            </label>
            <label>
              Description
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
            <label>
              Parent Category
              <div className="card" style={{ padding: 8 }}>
                <div
                  className="row"
                  style={{
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "6px 8px",
                    borderRadius: 8,
                    background: selectedParentSafe ? "transparent" : "rgba(34, 197, 94, 0.15)",
                  }}
                >
                  <strong>ROOT (No Parent)</strong>
                  <button type="button" className={selectedParentSafe ? "secondary" : ""} onClick={() => setSelectedParent("")}>
                    {selectedParentSafe ? "Select Parent" : "Selected"}
                  </button>
                </div>
                <div style={{ marginTop: 8, display: "grid", gap: 4 }}>{tree.map(renderTreeNode)}</div>
              </div>
            </label>
            <label>
              Sort Order
              <input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value || 0))} />
            </label>
            <label>
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Active
            </label>

            <section className="card" style={{ display: "grid", gap: 10 }}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <strong>Product Fields</strong>
                <button type="button" className="secondary" onClick={() => addField("product")} disabled={productFieldDrafts.length >= MAX_PRODUCT_FIELDS}>
                  Add Field
                </button>
              </div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>
                {`Fields: ${productFieldDrafts.length}/${MAX_PRODUCT_FIELDS}`}
              </div>

              {!productFieldDrafts.length ? <div style={{ opacity: 0.75 }}>No product fields configured.</div> : null}

              {productFieldDrafts.map((field, index) => renderFieldEditor(field, index, "product"))}
            </section>

            <section className="card" style={{ display: "grid", gap: 10 }}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <strong>Variant Fields</strong>
                <button type="button" className="secondary" onClick={() => addField("variant")} disabled={variantFieldDrafts.length >= MAX_PRODUCT_FIELDS}>
                  Add Field
                </button>
              </div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>
                {`Fields: ${variantFieldDrafts.length}/${MAX_PRODUCT_FIELDS}`}
              </div>

              {!variantFieldDrafts.length ? <div style={{ opacity: 0.75 }}>No variant fields configured.</div> : null}

              {variantFieldDrafts.map((field, index) => renderFieldEditor(field, index, "variant"))}
            </section>

            <section className="card" style={{ display: "grid", gap: 10 }}>
              <strong>Variant Options</strong>

              <div className="card" style={{ display: "grid", gap: 8 }}>
                <label>
                  <input type="checkbox" checked={sizeEnabled} onChange={(e) => setSizeEnabled(e.target.checked)} />
                  Enable Size
                </label>
                {sizeEnabled ? (
                  <label>
                    Size Values (comma or newline separated)
                    <textarea
                      rows={3}
                      value={sizeOptionsText}
                      onChange={(e) => setSizeOptionsText(e.target.value)}
                      placeholder="32, 34, 36"
                    />
                  </label>
                ) : null}
              </div>

              <div className="card" style={{ display: "grid", gap: 8 }}>
                <label>
                  <input type="checkbox" checked={colorEnabled} onChange={(e) => setColorEnabled(e.target.checked)} />
                  Enable Color
                </label>
                {colorEnabled ? (
                  <label>
                    Allowed Colors (optional)
                    <textarea
                      rows={3}
                      value={colorOptionsText}
                      onChange={(e) => setColorOptionsText(e.target.value)}
                      placeholder="red, gold, blue"
                    />
                  </label>
                ) : null}
              </div>
            </section>

            {validationWarnings.length ? (
              <section className="card" style={{ borderColor: "#f5c04d" }}>
                <strong>Warnings</strong>
                {validationWarnings.map((warning, index) => <div key={`warning-${index}`} style={{ fontSize: 13 }}>{warning}</div>)}
              </section>
            ) : null}

            {validationErrors.length ? (
              <section className="card" style={{ borderColor: "#ef4444" }}>
                <strong>Errors</strong>
                {validationErrors.map((warning, index) => <div key={`error-${index}`} style={{ fontSize: 13 }}>{warning}</div>)}
              </section>
            ) : null}

            <div className="row" style={{ gap: 8 }}>
              <button type="submit">Save Category</button>
              <button type="button" className="secondary" onClick={() => router.push("/admin/categories")}>Back</button>
            </div>
          </form>
        )}
      </section>
    </ProtectedPage>
  );
}
