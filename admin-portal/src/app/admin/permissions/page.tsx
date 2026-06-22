"use client";

import React, { FormEvent, useEffect, useState } from "react";
import { ProtectedPage } from "@/components/ProtectedPage";
import { DataTable } from "@/components/DataTable";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/api";

type PermissionDoc = {
  _id: string;
  code: string;
  description: string;
  isSystemPermission?: boolean;
};

export default function PermissionsPage() {
  const { accessToken, refreshAccessToken, me } = useAuth();
  const [permissions, setPermissions] = useState<PermissionDoc[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { code: string; description: string }>>({});
  const [error, setError] = useState("");
  const systemLevel = String(me?.systemLevel || me?.user?.systemLevel || "NONE").toUpperCase();
  const canMutatePermissions = systemLevel === "SUPER";

  const load = async () => {
    try {
      const payload = await apiRequest<{ permissions: PermissionDoc[] }>("/api/admin/permissions", {
        service: "auth",
        token: accessToken,
        onUnauthorized: refreshAccessToken,
      });
      setPermissions(payload.permissions || []);
      setDrafts(
        Object.fromEntries(
          (payload.permissions || []).map((permission) => [
            permission._id,
            { code: permission.code, description: permission.description },
          ])
        )
      );
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const updatePermission = async (permission: PermissionDoc) => {
    if (!canMutatePermissions) return;
    const draft = drafts[permission._id];
    if (!draft) return;
    try {
      await apiRequest("/api/admin/permissions", {
        service: "auth",
        method: "PUT",
        token: accessToken,
        onUnauthorized: refreshAccessToken,
        body: {
          id: permission._id,
          code: draft.code,
          description: draft.description,
        },
      });
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const deletePermission = async (permission: PermissionDoc) => {
    if (!canMutatePermissions) return;
    try {
      await apiRequest(`/api/admin/permissions/${permission._id}`, {
        service: "auth",
        method: "DELETE",
        token: accessToken,
        onUnauthorized: refreshAccessToken,
      });
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => { load(); }, []);

  const createPermission = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canMutatePermissions) return;
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
    <ProtectedPage anyOf={["permission:read"]}>
      <section className="card">
        <h1>Permissions</h1>
        {canMutatePermissions ? (
          <form onSubmit={createPermission} className="row" style={{ alignItems: "end" }}>
            <label style={{ flex: 1 }}>Code<input name="code" required /></label>
            <label style={{ flex: 1 }}>Description<input name="description" required /></label>
            <button>Create</button>
          </form>
        ) : (
          <p style={{ marginBottom: 0, opacity: 0.8 }}>Only super admins can change the permission catalog.</p>
        )}
      </section>
      {error ? <div className="error">{error}</div> : null}
      <DataTable
        headers={["Code", "Description", "Protection", "Action"]}
        rows={permissions.map((p) => [
          canMutatePermissions ? (
            <div key={`${p._id}:code`} style={{ display: "grid", gap: 6 }}>
              <input
                value={drafts[p._id]?.code || ""}
                disabled={!!p.isSystemPermission}
                onChange={(event) => setDrafts((current) => ({
                  ...current,
                  [p._id]: { ...(current[p._id] || { code: p.code, description: p.description }), code: event.target.value },
                }))}
              />
              {p.isSystemPermission ? <small style={{ opacity: 0.75 }}>System permission code is locked.</small> : null}
            </div>
          ) : p.code,
          canMutatePermissions ? (
            <input
              key={`${p._id}:description`}
              value={drafts[p._id]?.description || ""}
              onChange={(event) => setDrafts((current) => ({
                ...current,
                [p._id]: { ...(current[p._id] || { code: p.code, description: p.description }), description: event.target.value },
              }))}
            />
          ) : p.description,
          p.isSystemPermission ? "System protected" : "Custom",
          canMutatePermissions ? (
            <div key={p._id} className="row" style={{ gap: 8 }}>
              <button type="button" onClick={() => void updatePermission(p)}>Save</button>
              <button
                type="button"
                className="danger"
                onClick={() => void deletePermission(p)}
              >
                Delete
              </button>
            </div>
          ) : "Read only",
        ])}
      />
    </ProtectedPage>
  );
}
