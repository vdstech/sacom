"use client";

import { useEffect, useState } from "react";
import { ProtectedPage } from "@/components/ProtectedPage";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/api";
import { DataTable } from "@/components/DataTable";

type SessionDoc = {
  _id: string;
  userAgent: string;
  ip: string;
  lastSeenAt: string;
  createdAt: string;
};

export default function SessionsPage() {
  const { accessToken, refreshAccessToken } = useAuth();
  const [sessions, setSessions] = useState<SessionDoc[]>([]);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const payload = await apiRequest<{ sessions: SessionDoc[] }>("/auth/session", {
        service: "auth",
        token: accessToken,
        onUnauthorized: refreshAccessToken,
      });
      setSessions(payload.sessions || []);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <ProtectedPage>
      <section className="card row">
        <h1 style={{ marginRight: "auto" }}>Sessions</h1>
        <button className="secondary" onClick={load}>Refresh</button>
        <button
          className="danger"
          onClick={async () => {
            await apiRequest("/auth/session/deleteAllSessions", {
              service: "auth",
              token: accessToken,
              method: "DELETE",
              onUnauthorized: refreshAccessToken,
            });
            load();
          }}
        >
          Logout All
        </button>
      </section>
      {error ? <div className="error">{error}</div> : null}
      <DataTable
        headers={["Agent", "IP", "Last Seen", "Created At", "Action"]}
        rows={sessions.map((s) => [
          s.userAgent || "-",
          s.ip || "-",
          s.lastSeenAt ? new Date(s.lastSeenAt).toLocaleString() : "-",
          s.createdAt ? new Date(s.createdAt).toLocaleString() : "-",
          <button
            key={s._id}
            className="danger"
            onClick={async () => {
              await apiRequest("/auth/session/deleteSession", {
                service: "auth",
                token: accessToken,
                method: "DELETE",
                body: { sessionId: s._id },
                onUnauthorized: refreshAccessToken,
              });
              load();
            }}
          >
            Remove
          </button>,
        ])}
      />
    </ProtectedPage>
  );
}
