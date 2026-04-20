"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("superadmin@sa.com");
  const [password, setPassword] = useState("SuperAdmin@123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      router.push("/profile");
    } catch (err) {
      setError((err as Error).message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 720, margin: "60px auto", display: "grid", gap: 16 }}>
      <section className="card">
        <h1>Admin Login</h1>
        <form onSubmit={onSubmit} className="row" style={{ flexDirection: "column", alignItems: "stretch" }}>
          <label>
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error ? <div className="error">{error}</div> : null}
          <button disabled={loading}>{loading ? "Signing in..." : "Sign In"}</button>
        </form>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Local URLs</h2>
        <p style={{ marginTop: 0 }}>
          The admin menu is permission-based, so it becomes available after a successful sign-in.
        </p>
        <ul style={{ marginBottom: 0 }}>
          <li>Admin portal: <a href="https://localhost:3000">https://localhost:3000</a></li>
          <li>Gateway API: <a href="https://localhost:4000">https://localhost:4000</a></li>
          <li>Gateway health: <a href="https://localhost:4000/health">https://localhost:4000/health</a></li>
          <li>Customer storefront: <a href="http://localhost:3001">http://localhost:3001</a></li>
        </ul>
      </section>
    </div>
  );
}
