"use client";

import { ProtectedPage } from "@/components/ProtectedPage";

export default function AuditPage() {
  return (
    <ProtectedPage>
      <section className="card">
        <h1>Audit</h1>
        <p>Phase 2: activity timeline and actor/action/entity logs will be added here.</p>
      </section>
    </ProtectedPage>
  );
}
