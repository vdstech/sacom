"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAccount } from "@/components/AccountProvider";

export default function AccountAuthPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { customer, ready, login, signup } = useAccount();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const returnTo = useMemo(() => {
    const value = String(searchParams.get("returnTo") || "").trim();
    return value || "/";
  }, [searchParams]);

  useEffect(() => {
    if (ready && customer) router.replace(returnTo);
  }, [ready, customer, router, returnTo]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (mode === "login") {
        await login({ email, password });
      } else {
        await signup({ name, phone, email, password });
      }
      router.replace(returnTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to continue");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="section">
      <div className="account-auth">
        <div className="account-auth__card">
          <div className="section-kicker">Customer Account</div>
          <h1 className="section-title">{mode === "login" ? "Login to Siri" : "Create your Siri account"}</h1>
          <p className="section-copy">
            Save addresses, manage wishlist items, and track customer orders from one account.
          </p>

          <div className="account-auth__tabs">
            <button type="button" className={`account-auth__tab ${mode === "login" ? "is-active" : ""}`} onClick={() => setMode("login")}>
              Login
            </button>
            <button type="button" className={`account-auth__tab ${mode === "signup" ? "is-active" : ""}`} onClick={() => setMode("signup")}>
              Signup
            </button>
          </div>

          <form className="account-auth__form" onSubmit={handleSubmit}>
            {mode === "signup" ? (
              <>
                <label className="account-auth__field">
                  <span>Name</span>
                  <input value={name} onChange={(event) => setName(event.target.value)} required />
                </label>
                <label className="account-auth__field">
                  <span>Phone</span>
                  <input value={phone} onChange={(event) => setPhone(event.target.value)} />
                </label>
              </>
            ) : null}

            <label className="account-auth__field">
              <span>Email</span>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </label>

            <label className="account-auth__field">
              <span>Password</span>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            </label>

            {error ? <div className="status-banner status-banner--error">{error}</div> : null}

            <button type="submit" className="primary-button account-auth__submit" disabled={submitting}>
              {submitting ? "Please wait..." : mode === "login" ? "Login" : "Create Account"}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
