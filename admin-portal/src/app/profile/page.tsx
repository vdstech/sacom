"use client";

import { ProtectedPage } from "@/components/ProtectedPage";
import { useAuth } from "@/lib/auth";

export default function ProfilePage() {
  const { me } = useAuth();

  return (
    <ProtectedPage>
      <section className="card">
        <h1>Profile</h1>
        <p><b>Name:</b> {me?.user.name}</p>
        <p><b>Email:</b> {me?.user.email}</p>
        <p><b>System level:</b> {me?.systemLevel}</p>
      </section>
      <section className="card">
        <h2>Roles</h2>
        <ul>
          {(me?.roles || []).map((r) => (
            <li key={r.id}>{r.name} ({r.systemLevel})</li>
          ))}
        </ul>
      </section>
      <section className="card">
        <h2>Effective Permissions</h2>
        <div>{(me?.permissions || []).join(", ") || "No permissions"}</div>
      </section>
    </ProtectedPage>
  );
}
