"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ProtectedPage } from "@/components/ProtectedPage";
import { DataTable } from "@/components/DataTable";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/api";

type UserDoc = {
  _id: string;
  email: string;
  name: string;
  disabled: boolean;
  systemLevel: string;
};

export default function UsersPage() {
  const { accessToken, refreshAccessToken } = useAuth();
  const [users, setUsers] = useState<UserDoc[]>([]);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const payload = await apiRequest<UserDoc[]>("/api/admin/users", {
        service: "auth",
        token: accessToken,
        onUnauthorized: refreshAccessToken,
      });
      setUsers(payload || []);
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <ProtectedPage anyOf={["user:read", "user:write", "user:delete"]}>
      <section className="card row">
        <h1 style={{ marginRight: "auto" }}>Users</h1>
        <Link href="/admin/users/new"><button>Create User</button></Link>
        <button className="secondary" onClick={load}>Refresh</button>
      </section>
      {error ? <div className="error">{error}</div> : null}
      <DataTable
        headers={["Name", "Email", "System", "Status", "Actions"]}
        rows={users.map((u) => [
          u.name,
          u.email,
          u.systemLevel,
          u.disabled ? "Disabled" : "Active",
          <div key={u._id} className="row">
            <Link href={`/admin/users/${u._id}`}><button className="secondary">Open</button></Link>
            <button
              className="danger"
              onClick={async () => {
                await apiRequest(`/api/admin/users/${u._id}`, {
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
