"use client";

import { FormEvent, useEffect, useState } from "react";
import { ProtectedPage } from "@/components/ProtectedPage";
import { DataTable } from "@/components/DataTable";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/api";

type NavItem = {
  _id: string;
  name: string;
  slug: string;
  parentId?: string | null;
  path?: string;
};

export default function NavigationPage() {
  const { accessToken, refreshAccessToken } = useAuth();
  const [items, setItems] = useState<NavItem[]>([]);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const payload = await apiRequest<{ items: NavItem[] }>("/api/admin/navigation/items", {
        service: "navigation",
        token: accessToken,
        onUnauthorized: refreshAccessToken,
      });
      setItems(payload.items || []);
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => { load(); }, []);

  const createItem = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      await apiRequest("/api/admin/navigation/items", {
        service: "navigation",
        method: "POST",
        token: accessToken,
        onUnauthorized: refreshAccessToken,
        body: {
          name: String(form.get("name") || ""),
          slug: String(form.get("slug") || ""),
          path: String(form.get("path") || ""),
          parentId: String(form.get("parentId") || "") || null,
        },
      });
      (e.currentTarget as HTMLFormElement).reset();
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <ProtectedPage anyOf={["nav:read", "nav:write", "nav:delete", "nav:reorder"]}>
      <section className="card">
        <h1>Navigation</h1>
        <form onSubmit={createItem} className="row" style={{ alignItems: "end" }}>
          <label>Name<input name="name" required /></label>
          <label>Slug<input name="slug" required /></label>
          <label>Path<input name="path" /></label>
          <label>Parent Id<input name="parentId" /></label>
          <button>Create</button>
        </form>
      </section>
      {error ? <div className="error">{error}</div> : null}
      <DataTable
        headers={["Name", "Slug", "Parent", "Path", "Actions"]}
        rows={items.map((item) => [
          item.name,
          item.slug,
          item.parentId || "ROOT",
          item.path || "-",
          <div key={item._id} className="row">
            <button
              className="secondary"
              onClick={async () => {
                const name = window.prompt("New name", item.name);
                if (name === null) return;
                await apiRequest(`/api/admin/navigation/items/${item._id}`, {
                  service: "navigation",
                  method: "PATCH",
                  token: accessToken,
                  onUnauthorized: refreshAccessToken,
                  body: { name },
                });
                load();
              }}
            >
              Edit
            </button>
            <button
              className="danger"
              onClick={async () => {
                await apiRequest(`/api/admin/navigation/items/${item._id}`, {
                  service: "navigation",
                  method: "DELETE",
                  token: accessToken,
                  onUnauthorized: refreshAccessToken,
                });
                load();
              }}
            >
              Delete
            </button>
          </div>,
        ])}
      />
    </ProtectedPage>
  );
}
