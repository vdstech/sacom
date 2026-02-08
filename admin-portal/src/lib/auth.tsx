"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/api";
import type { MePayload } from "@/lib/types";
import type { ReactNode } from "react";

type AuthContextType = {
  accessToken: string | null;
  me: MePayload | null;
  loading: boolean;
  bootstrapError: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAccessToken: () => Promise<string | null>;
  reloadMe: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

function isValidMePayload(payload: unknown): payload is MePayload {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as Partial<MePayload>;
  if (!candidate.user || typeof candidate.user !== "object") return false;
  if (!candidate.user.email || !candidate.user.name) return false;
  if (!Array.isArray(candidate.permissions)) return false;
  if (!Array.isArray(candidate.roles)) return false;
  return true;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [me, setMe] = useState<MePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  const refreshAccessToken = async () => {
    try {
      const payload = await apiRequest<{ accessToken: string }>("/auth/refresh", {
        service: "auth",
        method: "POST",
      });
      setBootstrapError(null);
      setAccessToken(payload.accessToken);
      return payload.accessToken;
    } catch {
      setBootstrapError("AUTH_REFRESH_FAILED");
      setAccessToken(null);
      setMe(null);
      return null;
    }
  };

  const reloadMe = async () => {
    if (!accessToken) {
      setMe(null);
      setBootstrapError("ME_FETCH_FAILED");
      return;
    }
    try {
      const payload = await apiRequest<MePayload>("/api/me", {
        service: "auth",
        token: accessToken,
        onUnauthorized: refreshAccessToken,
      });
      if (!isValidMePayload(payload)) {
        setBootstrapError("ME_PAYLOAD_INVALID");
        setMe(null);
        return;
      }
      setBootstrapError(null);
      setMe(payload);
    } catch {
      setBootstrapError("ME_FETCH_FAILED");
      setMe(null);
    }
  };

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const token = await refreshAccessToken();
        if (!mounted) return;
        if (token) {
          try {
            const payload = await apiRequest<MePayload>("/api/me", {
              service: "auth",
              token,
            });
            if (!mounted) return;
            if (isValidMePayload(payload)) {
              setBootstrapError(null);
              setMe(payload);
            } else {
              setBootstrapError("ME_PAYLOAD_INVALID");
              setMe(null);
              setAccessToken(null);
            }
          } catch {
            if (!mounted) return;
            setBootstrapError("ME_FETCH_FAILED");
            setMe(null);
            setAccessToken(null);
          }
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const login = async (email: string, password: string) => {
    const payload = await apiRequest<{ accessToken: string }>("/auth/login", {
      service: "auth",
      method: "POST",
      body: { email, password },
    });
    setBootstrapError(null);
    setAccessToken(payload.accessToken);

    const mePayload = await apiRequest<MePayload>("/api/me", {
      service: "auth",
      token: payload.accessToken,
    });
    if (!isValidMePayload(mePayload)) {
      setBootstrapError("ME_PAYLOAD_INVALID");
      setAccessToken(null);
      setMe(null);
      throw new Error("Invalid session payload from /api/me");
    }
    setBootstrapError(null);
    setMe(mePayload);
  };

  const logout = async () => {
    await apiRequest("/auth/logout", {
      service: "auth",
      method: "POST",
    }).catch(() => null);
    setAccessToken(null);
    setMe(null);
    setBootstrapError(null);
  };

  const value = useMemo(
    () => ({
      accessToken,
      me,
      loading,
      bootstrapError,
      login,
      logout,
      refreshAccessToken,
      reloadMe,
    }),
    [accessToken, me, loading, bootstrapError]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
