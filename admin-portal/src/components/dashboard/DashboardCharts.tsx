"use client";

import React from "react";

type TrendPoint = {
  label: string;
  revenue: number;
  orders: number;
};

type ComparisonBar = {
  label: string;
  value: number;
};

function formatCurrency(value: number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

export function LineTrendChart({
  title,
  points,
}: {
  title: string;
  points: TrendPoint[];
}) {
  if (!points.length) {
    return <div className="dashboard-empty">No trend data is available for this period.</div>;
  }

  const maxRevenue = Math.max(...points.map((point) => point.revenue), 1);
  const chartWidth = 100;
  const chartHeight = 100;
  const path = points
    .map((point, index) => {
      const x = points.length === 1 ? chartWidth / 2 : (index / (points.length - 1)) * chartWidth;
      const y = chartHeight - (point.revenue / maxRevenue) * chartHeight;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <div className="dashboard-line-chart" aria-label={title}>
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none">
        <path d={path} />
      </svg>
      <div className="dashboard-line-chart__labels">
        {points.map((point) => (
          <div key={point.label} className="dashboard-line-chart__label">
            <strong>{point.label}</strong>
            <span>{formatCurrency(point.revenue)}</span>
            <small>{point.orders} orders</small>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ComparisonBars({
  title,
  bars,
}: {
  title: string;
  bars: ComparisonBar[];
}) {
  if (!bars.length) {
    return <div className="dashboard-empty">No comparison data is available yet.</div>;
  }

  const maxValue = Math.max(...bars.map((bar) => bar.value), 1);

  return (
    <div className="dashboard-comparison-bars" aria-label={title}>
      {bars.map((bar) => (
        <div key={bar.label} className="dashboard-comparison-bars__row">
          <div className="dashboard-comparison-bars__copy">
            <strong>{bar.label}</strong>
            <span>{formatCurrency(bar.value)}</span>
          </div>
          <div className="dashboard-comparison-bars__track">
            <span style={{ width: `${Math.max(6, (bar.value / maxValue) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
