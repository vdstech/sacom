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

type CategoryDoc = CategoryHierarchyNode & {
  slug: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
};

function slugify(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "");
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
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

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
      setCategory(categoryPayload);
      setCategories(list);
      setSelectedParent(categoryPayload.parent || "");
      setName(categoryPayload.name || "");
      setSlug(categoryPayload.slug || "");
      setSlugManuallyEdited(false);
      const rootParents = new Set<string>();
      for (const c of list) {
        if (!c.parent) rootParents.add(c._id);
      }
      setExpandedIds(rootParents);
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => { load(); }, [id]);

  const blockedParents = useMemo((): Set<string> => {
    if (!category) return new Set();
    const blocked = getDescendantIds(category._id, categories);
    blocked.add(category._id);
    return blocked;
  }, [category, categories]);

  const selectableCategories = useMemo(
    () => categories.filter((item) => !blockedParents.has(item._id)),
    [categories, blockedParents]
  );

  const tree = useMemo(() => {
    return buildHierarchyTree(selectableCategories);
  }, [selectableCategories]);

  const selectableIds = useMemo(
    () => new Set(selectableCategories.map((c) => c._id)),
    [selectableCategories]
  );

  const selectedParentSafe = useMemo(() => {
    if (!selectedParent) return "";
    return selectableIds.has(selectedParent) ? selectedParent : "";
  }, [selectedParent, selectableIds]);

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
    if (!slugManuallyEdited) {
      setSlug(slugify(value));
    }
  };

  const onSlugChange = (value: string) => {
    setSlug(value);
    setSlugManuallyEdited(true);
  };

  const resetSlugToAuto = () => {
    setSlug(slugify(name));
    setSlugManuallyEdited(false);
  };

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
          <button
            type="button"
            className={isSelected ? "" : "secondary"}
            onClick={() => setSelectedParent(node.id)}
          >
            {isSelected ? "Selected" : "Select Parent"}
          </button>
        </div>
        {hasChildren && isExpanded ? node.children.map(renderTreeNode) : null}
      </div>
    );
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      await apiRequest(`/api/categories/${id}`, {
        service: "catalog",
        method: "PUT",
        token: accessToken,
        onUnauthorized: refreshAccessToken,
        body: {
          name: String(form.get("name") || ""),
          slug: String(form.get("slug") || ""),
          description: String(form.get("description") || ""),
          sortOrder: Number(form.get("sortOrder") || 0),
          parent: String(form.get("parent") || "") || null,
          isActive: form.get("isActive") === "on",
        },
      });
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <ProtectedPage anyOf={["category:read", "category:write", "category:delete"]}>
      <section className="card">
        <h1>Category Detail</h1>
        {error ? <div className="error">{error}</div> : null}
        {!category ? <div>Loading...</div> : (
          <form onSubmit={onSubmit} className="row" style={{ flexDirection: "column", alignItems: "stretch" }}>
            <label>
              Name
              <input
                name="name"
                value={name}
                onChange={(e) => onNameChange(e.target.value)}
                required
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
            </label>
            <label>Description<textarea name="description" defaultValue={category.description || ""} /></label>
            <label>
              Parent Category
              <input type="hidden" name="parent" value={selectedParentSafe} />
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
                  <button
                    type="button"
                    className={selectedParentSafe ? "secondary" : ""}
                    onClick={() => setSelectedParent("")}
                  >
                    {selectedParentSafe ? "Select Parent" : "Selected"}
                  </button>
                </div>
                <div style={{ marginTop: 8, display: "grid", gap: 4 }}>
                  {tree.map(renderTreeNode)}
                </div>
              </div>
            </label>
            <label>Sort Order<input name="sortOrder" type="number" defaultValue={category.sortOrder || 0} /></label>
            <label><input type="checkbox" name="isActive" defaultChecked={!!category.isActive} /> Active</label>
            <div className="row">
              <button>Save</button>
              <button
                type="button"
                className="danger"
                onClick={async () => {
                  await apiRequest(`/api/categories/${id}`, {
                    service: "catalog",
                    method: "DELETE",
                    token: accessToken,
                    onUnauthorized: refreshAccessToken,
                  });
                  router.push("/admin/categories");
                }}
              >
                Delete
              </button>
            </div>
          </form>
        )}
      </section>
    </ProtectedPage>
  );
}
