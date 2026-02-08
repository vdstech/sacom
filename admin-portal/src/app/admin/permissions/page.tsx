"use client";

import { FormEvent, useEffect, useState } from "react";
import { ProtectedPage } from "@/components/ProtectedPage";
import { DataTable } from "@/components/DataTable";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/api";

type PermissionDoc = {
  _id: string;
  code: string;
  description: string;
};

export default function PermissionsPage() {
  const { accessToken, refreshAccessToken } = useAuth();
  const [permissions, setPermissions] = useState<PermissionDoc[]>([]);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const payload = await apiRequest<{ permissions: PermissionDoc[] }>("/api/admin/permissions", {
        service: "auth",
        token: accessToken,
        onUnauthorized: refreshAccessToken,
      });
      setPermissions(payload.permissions || []);
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => { load(); }, []);

  const createPermission = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      await apiRequest("/api/admin/permissions", {
        service: "auth",
        method: "POST",
        token: accessToken,
        onUnauthorized: refreshAccessToken,
        body: {
          code: String(form.get("code") || ""),
          description: String(form.get("description") || ""),
          children: [],
        },
      });
      (e.currentTarget as HTMLFormElement).reset();
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <ProtectedPage anyOf={["permission:read", "permission:create", "permission:delete"]}>
      <section className="card">
        <h1>Permissions</h1>
        <form onSubmit={createPermission} className="row" style={{ alignItems: "end" }}>
          <label style={{ flex: 1 }}>Code<input name="code" required /></label>
          <label style={{ flex: 1 }}>Description<input name="description" required /></label>
          <button>Create</button>
        </form>
      </section>
      {error ? <div className="error">{error}</div> : null}
      <DataTable
        headers={["Code", "Description", "Action"]}
        rows={permissions.map((p) => [
          p.code,
          p.description,
          <button
            key={p._id}
            className="danger"
            onClick={async () => {
              await apiRequest(`/api/admin/permissions/${p._id}`, {
                service: "auth",
                method: "DELETE",
                token: accessToken,
                onUnauthorized: refreshAccessToken,
              });
              load();
            }}
          >
            Delete
          </button>,
        ])}
      />
    </ProtectedPage>
  );
}
