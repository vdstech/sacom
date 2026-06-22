"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ADMIN_UI_STRINGS } from "@/lib/uiStrings";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
      setError((err as Error).message || ADMIN_UI_STRINGS.login.failed);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 720, margin: "60px auto", display: "grid", gap: 16 }}>
      <section className="card">
        <h1>{ADMIN_UI_STRINGS.login.title}</h1>
        <form onSubmit={onSubmit} className="row" style={{ flexDirection: "column", alignItems: "stretch" }}>
          <label>
            {ADMIN_UI_STRINGS.login.fields.email}
            <input value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            {ADMIN_UI_STRINGS.login.fields.password}
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error ? <div className="error">{error}</div> : null}
          <button disabled={loading}>{loading ? ADMIN_UI_STRINGS.login.signingIn : ADMIN_UI_STRINGS.login.signIn}</button>
        </form>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>{ADMIN_UI_STRINGS.login.localUrlsTitle}</h2>
        <p style={{ marginTop: 0 }}>
          {ADMIN_UI_STRINGS.login.localUrlsCopy}
        </p>
        <ul style={{ marginBottom: 0 }}>
          <li>{ADMIN_UI_STRINGS.localUrls.adminPortal}: <a href="http://localhost:3000">http://localhost:3000</a></li>
          <li>{ADMIN_UI_STRINGS.localUrls.gatewayApi}: <a href="http://localhost:4000">http://localhost:4000</a></li>
          <li>{ADMIN_UI_STRINGS.localUrls.gatewayHealth}: <a href="http://localhost:4000/health">http://localhost:4000/health</a></li>
          <li>{ADMIN_UI_STRINGS.localUrls.storefront}: <a href="http://localhost:3001">http://localhost:3001</a></li>
        </ul>
      </section>
    </div>
  );
}
