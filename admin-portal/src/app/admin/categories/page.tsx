"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ProtectedPage } from "@/components/ProtectedPage";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import {
  buildHierarchyTree,
  type CategoryHierarchyNode,
  type CategoryTreeNode,
} from "@/lib/categoryHierarchy";

type CategoryDoc = CategoryHierarchyNode & {
  slug: string;
  isActive: boolean;
  sortOrder: number;
};

export default function CategoriesPage() {
  const { accessToken, refreshAccessToken } = useAuth();
  const [categories, setCategories] = useState<CategoryDoc[]>([]);
  const [error, setError] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const load = async () => {
    try {
      const payload = await apiRequest<CategoryDoc[]>("/api/categories", {
        service: "catalog",
        token: accessToken,
        onUnauthorized: refreshAccessToken,
      });
      const list = payload || [];
      setCategories(list);
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

  useEffect(() => { load(); }, []);

  const tree = useMemo(() => buildHierarchyTree(categories), [categories]);

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const byId = useMemo(() => {
    const map = new Map<string, CategoryDoc>();
    for (const c of categories) map.set(c._id, c);
    return map;
  }, [categories]);

  const renderTreeNode = (node: CategoryTreeNode) => {
    const category = byId.get(node.id);
    if (!category) return null;
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedIds.has(node.id);

    return (
      <div key={node.id}>
        <div
          className="row"
          style={{
            alignItems: "center",
            gap: 8,
            padding: "8px 10px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            marginLeft: `${node.depth * 14}px`,
          }}
        >
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
          <div style={{ minWidth: 220, fontWeight: 600 }}>{category.name}</div>
          <div style={{ minWidth: 200, opacity: 0.85 }}>{category.slug}</div>
          <div style={{ minWidth: 70 }}>{String(category.sortOrder || 0)}</div>
          <div style={{ minWidth: 90 }}><StatusBadge active={!!category.isActive} /></div>
          <Link href={`/admin/categories/${category._id}`}><button className="secondary">Edit</button></Link>
        </div>
        {hasChildren && isExpanded ? node.children.map(renderTreeNode) : null}
      </div>
    );
  };

  return (
    <ProtectedPage anyOf={["category:read", "category:write", "category:delete"]}>
      <section className="card row">
        <h1 style={{ marginRight: "auto" }}>Categories</h1>
        <Link href="/admin/categories/new"><button>Create Category</button></Link>
        <button className="secondary" onClick={load}>Refresh</button>
      </section>
      {error ? <div className="error">{error}</div> : null}
      <section className="card">
        <div
          className="row"
          style={{
            gap: 8,
            fontWeight: 600,
            padding: "8px 10px",
            borderBottom: "1px solid rgba(255,255,255,0.12)",
          }}
        >
          <span style={{ width: 28 }} />
          <span style={{ minWidth: 220 }}>Name</span>
          <span style={{ minWidth: 200 }}>Slug</span>
          <span style={{ minWidth: 70 }}>Sort</span>
          <span style={{ minWidth: 90 }}>Status</span>
          <span>Action</span>
        </div>
        <div style={{ display: "grid", gap: 2 }}>
          {tree.map(renderTreeNode)}
        </div>
      </section>
    </ProtectedPage>
  );
}
