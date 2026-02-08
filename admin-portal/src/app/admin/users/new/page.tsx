"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ProtectedPage } from "@/components/ProtectedPage";
import { FormDrawer } from "@/components/FormDrawer";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/api";

type RoleDoc = { _id: string; name: string };

export default function NewUserPage() {
  const router = useRouter();
  const { accessToken, refreshAccessToken } = useAuth();
  const [roles, setRoles] = useState<RoleDoc[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiRequest<RoleDoc[]>("/api/admin/roles", {
      service: "auth",
      token: accessToken,
      onUnauthorized: refreshAccessToken,
    }).then(setRoles).catch((e) => setError((e as Error).message));
  }, []);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const selectedRoles = form.getAll("roles").map(String);
    setLoading(true);
    setError("");
    try {
      await apiRequest("/api/admin/users", {
        service: "auth",
        method: "POST",
        token: accessToken,
        onUnauthorized: refreshAccessToken,
        body: {
          name: String(form.get("name") || ""),
          email: String(form.get("email") || ""),
          password: String(form.get("password") || ""),
          roles: selectedRoles,
        },
      });
      router.push("/admin/users");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ProtectedPage anyOf={["user:write"]}>
      <FormDrawer title="Create User">
        <form onSubmit={onSubmit} className="row" style={{ flexDirection: "column", alignItems: "stretch" }}>
          <label>Name<input name="name" required /></label>
          <label>Email<input type="email" name="email" required /></label>
          <label>Password<input type="password" name="password" required /></label>
          <label>Roles
            <select name="roles" multiple required size={Math.max(roles.length, 3)}>
              {roles.map((role) => <option key={role._id} value={role._id}>{role.name}</option>)}
            </select>
          </label>
          {error ? <div className="error">{error}</div> : null}
          <button disabled={loading}>{loading ? "Creating..." : "Create User"}</button>
        </form>
      </FormDrawer>
    </ProtectedPage>
  );
}
