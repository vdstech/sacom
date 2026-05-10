"use client";

import React, { FormEvent, useEffect, useMemo, useState } from "react";
import { ProtectedPage } from "@/components/ProtectedPage";
import { DataTable } from "@/components/DataTable";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/api";
import { MENU_ITEMS } from "@/lib/permissions";
import { buildRbacWarnings } from "@/lib/rbacWarnings";

type RoleDoc = {
  _id: string;
  name: string;
  description: string;
  isSystemRole: boolean;
  permissions: string[];
  visibleMenusConfigured: boolean;
  visibleMenus: string[];
};

type PermissionDoc = { _id: string; code: string };
type RoleFormState = {
  name: string;
  description: string;
  permissions: string[];
  visibleMenusConfigured: boolean;
  visibleMenus: string[];
};

const EMPTY_FORM: RoleFormState = {
  name: "",
  description: "",
  permissions: [],
  visibleMenusConfigured: false,
  visibleMenus: [],
};

export default function RolesPage() {
  const { accessToken, refreshAccessToken } = useAuth();
  const [roles, setRoles] = useState<RoleDoc[]>([]);
  const [permissions, setPermissions] = useState<PermissionDoc[]>([]);
  const [error, setError] = useState("");
  const [editingRoleId, setEditingRoleId] = useState("");
  const [formState, setFormState] = useState<RoleFormState>(EMPTY_FORM);

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

  const editingRole = useMemo(
    () => roles.find((role) => role._id === editingRoleId) || null,
    [roles, editingRoleId]
  );
  const permissionCodeById = useMemo(
    () => new Map(permissions.map((permission) => [permission._id, permission.code])),
    [permissions]
  );
  const selectedPermissionCodes = useMemo(
    () => formState.permissions
      .map((permissionId) => permissionCodeById.get(permissionId))
      .filter((code): code is string => !!code)
      .sort(),
    [formState.permissions, permissionCodeById]
  );
  const warningMenuIds = useMemo(
    () => formState.visibleMenusConfigured
      ? formState.visibleMenus
      : MENU_ITEMS.map((item) => item.id),
    [formState.visibleMenus, formState.visibleMenusConfigured]
  );
  const rbacWarnings = useMemo(
    () => buildRbacWarnings(selectedPermissionCodes, warningMenuIds),
    [selectedPermissionCodes, warningMenuIds]
  );

  const resetForm = () => {
    setEditingRoleId("");
    setFormState(EMPTY_FORM);
  };

  const saveRole = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      const path = editingRoleId ? `/api/admin/roles/${editingRoleId}` : "/api/admin/roles";
      await apiRequest(path, {
        service: "auth",
        method: editingRoleId ? "PUT" : "POST",
        token: accessToken,
        onUnauthorized: refreshAccessToken,
        body: {
          name: formState.name,
          description: formState.description,
          permissions: formState.permissions,
          visibleMenusConfigured: formState.visibleMenusConfigured,
          visibleMenus: formState.visibleMenusConfigured ? formState.visibleMenus : [],
        },
      });
      resetForm();
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <ProtectedPage anyOf={["role:read", "role:create", "role:update", "role:delete"]}>
      <section className="card">
        <h1>Roles</h1>
        <form onSubmit={saveRole} className="row" style={{ alignItems: "end" }}>
          <label style={{ flex: 1 }}>
            Name
            <input
              name="name"
              required
              value={formState.name}
              onChange={(event) => setFormState((current) => ({ ...current, name: event.target.value }))}
            />
          </label>
          <label style={{ flex: 1 }}>
            Description
            <input
              name="description"
              value={formState.description}
              onChange={(event) => setFormState((current) => ({ ...current, description: event.target.value }))}
            />
          </label>
          <label style={{ flex: 1 }}>
            Permissions
            <select
              name="permissions"
              multiple
              required
              size={6}
              value={formState.permissions}
              onChange={(event) => setFormState((current) => ({
                ...current,
                permissions: Array.from(event.target.selectedOptions, (option) => option.value),
              }))}
            >
              {permissions.map((p) => <option key={p._id} value={p._id}>{p.code}</option>)}
            </select>
          </label>
          <label style={{ flex: 1 }}>
            Limit Visible Menus
            <input
              type="checkbox"
              checked={formState.visibleMenusConfigured}
              onChange={(event) => setFormState((current) => ({
                ...current,
                visibleMenusConfigured: event.target.checked,
                visibleMenus: event.target.checked ? current.visibleMenus : [],
              }))}
            />
          </label>
          <label style={{ flex: 1 }}>
            Visible Menus
            <select
              name="visibleMenus"
              multiple
              size={6}
              disabled={!formState.visibleMenusConfigured}
              value={formState.visibleMenus}
              onChange={(event) => setFormState((current) => ({
                ...current,
                visibleMenus: Array.from(event.target.selectedOptions, (option) => option.value),
              }))}
            >
              {MENU_ITEMS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <button>{editingRoleId ? "Save" : "Create"}</button>
          {editingRoleId ? (
            <button type="button" className="secondary" onClick={resetForm}>Cancel</button>
          ) : null}
        </form>
        {rbacWarnings.length ? (
          <div
            data-testid="rbac-warning-list"
            style={{
              marginTop: 16,
              padding: 12,
              borderRadius: 12,
              border: "1px solid rgba(255, 193, 7, 0.35)",
              background: "rgba(255, 193, 7, 0.08)",
              display: "grid",
              gap: 10,
            }}
          >
            <strong>Configuration Warnings</strong>
            {rbacWarnings.map((warning) => (
              <div key={warning.type} style={{ display: "grid", gap: 4 }}>
                <div>{warning.message}</div>
                <div style={{ fontSize: 13, opacity: 0.85 }}>
                  Suggested fix: {warning.recommendedFix}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>
      {error ? <div className="error">{error}</div> : null}
      <DataTable
        headers={["Name", "Description", "System", "Permissions", "Menu Filter", "Actions"]}
        rows={roles.map((r) => [
          r.name,
          r.description || "-",
          r.isSystemRole ? "Yes" : "No",
          String(r.permissions?.length || 0),
          r.visibleMenusConfigured ? `${String(r.visibleMenus?.length || 0)} selected` : "All by default",
          <div key={r._id} className="row">
            <button
              className="secondary"
              onClick={() => {
                setEditingRoleId(r._id);
                setFormState({
                  name: r.name,
                  description: r.description || "",
                  permissions: r.permissions || [],
                  visibleMenusConfigured: !!r.visibleMenusConfigured,
                  visibleMenus: r.visibleMenusConfigured ? (r.visibleMenus || []) : [],
                });
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
