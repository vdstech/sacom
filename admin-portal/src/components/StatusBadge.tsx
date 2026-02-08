"use client";

export function StatusBadge({ active }: { active: boolean }) {
  return <span className={active ? "badge active" : "badge"}>{active ? "Active" : "Inactive"}</span>;
}
