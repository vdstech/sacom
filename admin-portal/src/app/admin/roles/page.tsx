"use client";

import { FormEvent, useEffect, useState } from "react";
import { ProtectedPage } from "@/components/ProtectedPage";
import { DataTable } from "@/components/DataTable";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/api";

type RoleDoc = {
  _id: string;
  name: string;
  description: string;
  isSystemRole: boolean;
  permissions: string[];
};

type PermissionDoc = { _id: string; code: string };

export default function RolesPage() {
  const { accessToken, refreshAccessToken } = useAuth();
  const [roles, setRoles] = useState<RoleDoc[]>([]);
  const [permissions, setPermissions] = useState<PermissionDoc[]>([]);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const [rolePayload, permissionPayload] = await Promise.all([
        apiRequest<RoleDoc[]>("/api/admin/roles", {
          service: "auth",
          token: accessToken,
          onUnauthorized: refreshAccessToken,
        }),
        apiRequest<{ permissions: PermissionDoc[] }>("/api/admin/permissions", {
          service: "auth",
          token: accessToken,
          onUnauthorized: refreshAccessToken,
        }),
      ]);
      setRoles(rolePayload || []);
      setPermissions(permissionPayload.permissions || []);
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => { load(); }, []);

  const createRole = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      await apiRequest("/api/admin/roles", {
        service: "auth",
        method: "POST",
        token: accessToken,
        onUnauthorized: refreshAccessToken,
        body: {
          name: String(form.get("name") || ""),
          description: String(form.get("description") || ""),
          permissions: form.getAll("permissions").map(String),
        },
      });
      (e.currentTarget as HTMLFormElement).reset();
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <ProtectedPage anyOf={["role:read", "role:create", "role:update", "role:delete"]}>
      <section className="card">
        <h1>Roles</h1>
        <form onSubmit={createRole} className="row" style={{ alignItems: "end" }}>
          <label style={{ flex: 1 }}>Name<input name="name" required /></label>
          <label style={{ flex: 1 }}>Description<input name="description" /></label>
          <label style={{ flex: 1 }}>Permissions
            <select name="permissions" multiple required size={4}>
              {permissions.map((p) => <option key={p._id} value={p._id}>{p.code}</option>)}
            </select>
          </label>
          <button>Create</button>
        </form>
      </section>
      {error ? <div className="error">{error}</div> : null}
      <DataTable
        headers={["Name", "Description", "System", "Permissions", "Actions"]}
        rows={roles.map((r) => [
          r.name,
          r.description || "-",
          r.isSystemRole ? "Yes" : "No",
          String(r.permissions?.length || 0),
          <div key={r._id} className="row">
            <button
              className="secondary"
              onClick={async () => {
                const description = window.prompt("Description", r.description || "");
                if (description === null) return;
                await apiRequest(`/api/admin/roles/${r._id}`, {
                  service: "auth",
                  method: "PUT",
                  token: accessToken,
                  onUnauthorized: refreshAccessToken,
                  body: { description },
                });
                load();
              }}
            >
              Edit
            </button>
            <button
              className="danger"
              disabled={r.isSystemRole}
              onClick={async () => {
                await apiRequest(`/api/admin/roles/${r._id}`, {
                  service: "auth",
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
