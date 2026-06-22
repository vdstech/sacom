import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OrdersDashboardPage from "./page";

const useAuthMock = vi.fn();
const apiRequestMock = vi.fn();

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/lib/api", () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
}));

vi.mock("@/components/ProtectedPage", () => ({
  ProtectedPage: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/dashboard/DashboardNav", () => ({
  DashboardNav: () => <div data-testid="dashboard-nav" />,
}));

vi.mock("@/components/dashboard/DashboardCharts", () => ({
  LineTrendChart: () => <div data-testid="trend-chart" />,
  ComparisonBars: () => <div data-testid="comparison-bars" />,
}));

describe("OrdersDashboardPage", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    apiRequestMock.mockImplementation((path: string) => {
      if (path.startsWith("/api/admin/orders/dashboard?")) {
        return Promise.resolve({
          dashboard: {
            range: { label: "Last 30 days" },
            summary: { processing: 0, packaging: 0, shipping: 0, cancellations: 0, shipped: 0, cancelled: 0, total: 0 },
            kpis: {
              revenue: 125000,
              orders: 42,
              averageOrderValue: 2976,
              pendingOrders: 9,
              pendingProcessing: 3,
              pendingPackaging: 2,
              pendingShipping: 4,
              cancelledOrders: 0,
              issueCases: 1,
              exchangeCases: 2,
              pendingIssueInvestigations: 3,
              couponsIssued: 4,
              couponsIssuedValue: 1800,
              couponsConsumed: 2,
              couponsConsumedValue: 900,
              failedCheckouts: 5,
              abandonedCheckouts: 6,
            },
            salesTrend: { granularity: "week", points: [] },
            weeklySalesTrend: [],
            currentYearMonthlyTrend: [],
            comparisons: {
              weekly: { period: "week", current: { revenue: 0, orders: 0 }, previous: { revenue: 0, orders: 0 }, delta: { revenue: 0, orders: 0, revenuePct: 0, ordersPct: 0 } },
              monthly: { period: "month", current: { revenue: 0, orders: 0 }, previous: { revenue: 0, orders: 0 }, delta: { revenue: 0, orders: 0, revenuePct: 0, ordersPct: 0 } },
              yearly: { period: "year", current: { revenue: 0, orders: 0 }, previous: { revenue: 0, orders: 0 }, delta: { revenue: 0, orders: 0, revenuePct: 0, ordersPct: 0 } },
            },
            ordersByStatus: [],
            recentOrders: [],
            topSellingProducts: [],
            topSellingCategories: [],
            actionRequired: [
              { key: "processing", label: "Processing queue", count: 3, href: "/admin/orders/processing" },
              { key: "issue_cases", label: "Issue / exchange investigations", count: 3, href: "/admin/orders/returns-exchanges" },
              { key: "failed_checkouts", label: "Failed checkouts", count: 5, href: "/admin/orders/dashboard" },
            ],
          },
        });
      }
      if (path === "/api/admin/products/inventory/dashboard-summary?threshold=2&limit=8") {
        return Promise.resolve({
          summary: {
            threshold: 2,
            totalActiveProducts: 0,
            totalActiveVariants: 0,
            lowStockVariantsCount: 0,
            outOfStockVariantsCount: 0,
            lowStockVariants: [],
            outOfStockVariants: [],
            recentUpdatedItems: [],
            categoryRisk: [],
          },
        });
      }
      if (path.startsWith("/api/admin/orders/dashboard/fulfillment")) {
        return Promise.resolve({
          summary: { processing: 1, packaging: 0, shipping: 0, shipped: 0, delayed: 0, violated: 0, total: 1 },
          items: [{
            orderId: "order-1",
            orderDisplayId: "#ORDER1",
            itemId: "item-1",
            customerName: "Asha Rao",
            currentFulfillmentStatus: "RESERVED",
            currentStage: "Processing",
            currentOwner: "WAREHOUSE",
            customerOrderedDate: "2026-05-10T10:00:00.000Z",
            targetCompletionDate: "2026-05-13T10:00:00.000Z",
            laneAssignedAt: "2026-05-10T10:00:00.000Z",
            lastActionedAt: "2026-05-10T10:00:00.000Z",
            slaStatus: "ON_TRACK",
            hoursInLane: 2,
          }],
          total: 1,
          page: 1,
          limit: 25,
          totalPages: 1,
        });
      }
      if (path === "/api/admin/orders/dashboard/escalations") {
        return Promise.resolve({
          summary: { processing: 0, packaging: 0, shipping: 0, shipped: 0, delayed: 0, violated: 1, total: 1 },
          items: [{
            orderId: "order-2",
            orderDisplayId: "#ORDER2",
            itemId: "item-2",
            customerName: "Mira Das",
            currentFulfillmentStatus: "SHIPPING_IN_PROGRESS",
            currentStage: "Shipping",
            currentOwner: "SHIPPING_OPERATOR",
            customerOrderedDate: "2026-05-08T10:00:00.000Z",
            targetCompletionDate: "2026-05-11T10:00:00.000Z",
            laneAssignedAt: "2026-05-08T10:00:00.000Z",
            lastActionedAt: "2026-05-08T10:00:00.000Z",
            slaStatus: "VIOLATED",
            hoursInLane: 52,
            activeEscalation: { reason: "Shipping lane exceeded 48 hours without completion", status: "OPEN" },
          }],
          total: 1,
          page: 1,
          limit: 25,
          totalPages: 1,
        });
      }
      return Promise.resolve({});
    });
  });

  it("keeps overview on the main dashboard and loads fulfillment on tab click", async () => {
    useAuthMock.mockReturnValue({
      accessToken: "token",
      refreshAccessToken: vi.fn(),
      me: {
        permissions: ["order:read", "order:dashboard:fulfillment:read", "order:dashboard:escalations:read"],
        systemLevel: "NONE",
        user: { systemLevel: "NONE" },
      },
    });

    render(<OrdersDashboardPage />);

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/admin/orders/dashboard?"),
      expect.objectContaining({ token: "token" })
    ));

    expect(await screen.findByText("Total Payable Revenue")).toBeInTheDocument();
    expect(screen.getByText("Issue / Exchange Investigations")).toBeInTheDocument();
    expect(screen.getByText("Cash Coupons Generated")).toBeInTheDocument();
    expect(screen.getByText("Processing queue")).toBeInTheDocument();
    expect(screen.getByText("Low Stock Variants")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Fulfillment" }));

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/admin/orders/dashboard/fulfillment"),
      expect.objectContaining({ token: "token" })
    ));
    expect(await screen.findByText("Asha Rao")).toBeInTheDocument();
  });

  it("shows escalation tab by permission without exposing fulfillment automatically", async () => {
    useAuthMock.mockReturnValue({
      accessToken: "token",
      refreshAccessToken: vi.fn(),
      me: {
        permissions: ["order:read", "order:dashboard:escalations:read"],
        systemLevel: "NONE",
        user: { systemLevel: "NONE" },
      },
    });

    render(<OrdersDashboardPage />);

    expect(screen.queryByRole("button", { name: "Fulfillment" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Escalations" }));

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledWith(
      "/api/admin/orders/dashboard/escalations",
      expect.objectContaining({ token: "token" })
    ));
    expect(await screen.findByText("Mira Das")).toBeInTheDocument();
  });

  it("does not fetch or render inventory drilldowns without inventory permission", async () => {
    useAuthMock.mockReturnValue({
      accessToken: "token",
      refreshAccessToken: vi.fn(),
      me: {
        permissions: ["order:read"],
        systemLevel: "NONE",
        user: { systemLevel: "NONE" },
      },
    });

    render(<OrdersDashboardPage />);

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/admin/orders/dashboard?"),
      expect.objectContaining({ token: "token" })
    ));

    expect(apiRequestMock).not.toHaveBeenCalledWith(
      "/api/admin/products/inventory/dashboard-summary?threshold=2&limit=8",
      expect.anything()
    );
    expect(screen.queryByText("Category Risk")).not.toBeInTheDocument();
  });
});
