"use client";

import { useState } from "react";

export function ConfirmDialog({
  label,
  confirmText = "Confirm",
  onConfirm,
}: {
  label: string;
  confirmText?: string;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <button
      className="danger"
      disabled={busy}
      onClick={async () => {
        const ok = window.confirm(label);
        if (!ok) return;
        setBusy(true);
        try {
          await onConfirm();
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "Working..." : confirmText}
    </button>
  );
}
