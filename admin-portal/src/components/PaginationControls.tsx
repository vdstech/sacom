"use client";

import React from "react";

type PaginationControlsProps = {
  page: number;
  totalPages: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
  previousLabel: string;
  nextLabel: string;
};

export function PaginationControls({
  page,
  totalPages,
  total,
  onPrevious,
  onNext,
  previousLabel,
  nextLabel,
}: PaginationControlsProps) {
  return (
    <section className="card row" style={{ justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <div>{`Total rows: ${total}`}</div>
      <div className="row" style={{ gap: 12 }}>
        <button className="secondary" onClick={onPrevious} disabled={page <= 1}>
          {previousLabel}
        </button>
        <div>{`Page ${page} of ${Math.max(1, totalPages)}`}</div>
        <button className="secondary" onClick={onNext} disabled={page >= totalPages}>
          {nextLabel}
        </button>
      </div>
    </section>
  );
}
