"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ProtectedPage } from "@/components/ProtectedPage";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/api";

type UserDoc = {
  _id: string;
  name: string;
  email: string;
  disabled: boolean;
  force_reset: boolean;
  roles: string[];
};

type RoleDoc = { _id: string; name: string };

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { accessToken, refreshAccessToken } = useAuth();
  const [user, setUser] = useState<UserDoc | null>(null);
  const [roles, setRoles] = useState<RoleDoc[]>([]);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const [userPayload, rolePayload] = await Promise.all([
        apiRequest<UserDoc>(`/api/admin/users/${id}`, {
          service: "auth",
          token: accessToken,
          onUnauthorized: refreshAccessToken,
        }),
        apiRequest<RoleDoc[]>("/api/admin/roles", {
          service: "auth",
          token: accessToken,
          onUnauthorized: refreshAccessToken,
        }),
      ]);
      setUser(userPayload);
      setRoles(rolePayload || []);
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => { load(); }, [id]);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const selectedRoles = form.getAll("roles").map(String);
    try {
      await apiRequest(`/api/admin/users/${id}`, {
        service: "auth",
        method: "PUT",
        token: accessToken,
        onUnauthorized: refreshAccessToken,
        body: {
          name: String(form.get("name") || ""),
          disabled: form.get("disabled") === "on",
          force_reset: form.get("force_reset") === "on",
          roles: selectedRoles,
        },
      });
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <ProtectedPage anyOf={["user:write", "user:read"]}>
      <section className="card">
        <h1>User Detail</h1>
        {error ? <div className="error">{error}</div> : null}
        {!user ? <div>Loading...</div> : (
          <form onSubmit={onSubmit} className="row" style={{ flexDirection: "column", alignItems: "stretch" }}>
            <label>Name<input name="name" defaultValue={user.name} required /></label>
            <label>Email<input defaultValue={user.email} disabled /></label>
            <label>Roles
              <select name="roles" multiple size={Math.max(roles.length, 3)} defaultValue={user.roles?.map(String) || []}>
                {roles.map((role) => <option key={role._id} value={role._id}>{role.name}</option>)}
              </select>
            </label>
            <label><input type="checkbox" name="disabled" defaultChecked={!!user.disabled} /> Disabled</label>
            <label><input type="checkbox" name="force_reset" defaultChecked={!!user.force_reset} /> Force password reset</label>
            <button>Save</button>
          </form>
        )}
      </section>
    </ProtectedPage>
  );
}
