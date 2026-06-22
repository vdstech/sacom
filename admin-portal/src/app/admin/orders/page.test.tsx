import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OrdersPage from "./page";

const useAuthMock = vi.fn();
const apiRequestMock = vi.fn();
const pushMock = vi.fn();
let currentQuery = "";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/orders",
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams(currentQuery),
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

function buildPayload() {
  return {
    items: [
      {
        id: "order-1",
        displayId: "#ORDER1",
        placedAt: "2026-05-10T10:00:00.000Z",
        paymentStatus: "paid",
        fulfillmentStatus: "SHIPPED",
        itemCount: 1,
        grandTotal: 1200,
        currency: "INR",
        addressSnapshot: { fullName: "Asha Rao" },
      },
    ],
    total: 1,
    page: 1,
    limit: 25,
    totalPages: 1,
  };
}

describe("OrdersPage filters", () => {
  beforeEach(() => {
    currentQuery = "";
    pushMock.mockReset();
    pushMock.mockImplementation((nextUrl: string) => {
      currentQuery = nextUrl.split("?")[1] || "";
    });
    apiRequestMock.mockReset();
    apiRequestMock.mockResolvedValue(buildPayload());
    useAuthMock.mockReturnValue({
      accessToken: "token",
      refreshAccessToken: vi.fn(),
    });
  });

  it("reflects orderStatus from the URL in the dropdown and initial API request", async () => {
    currentQuery = "orderStatus=SHIPPED";

    render(<OrdersPage />);

    await waitFor(() =>
      expect(apiRequestMock).toHaveBeenCalledWith(
        "/api/admin/orders?orderStatus=SHIPPED&limit=25",
        expect.objectContaining({
          token: "token",
          onUnauthorized: expect.any(Function),
        })
      )
    );

    expect(screen.getByRole("combobox")).toHaveValue("SHIPPED");
  });

  it("auto-applies the status dropdown by pushing the new query and reloading", async () => {
    const { rerender } = render(<OrdersPage />);

    await waitFor(() =>
      expect(apiRequestMock).toHaveBeenCalledWith(
        "/api/admin/orders?limit=25",
        expect.objectContaining({ token: "token" })
      )
    );

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "CANCELLED" } });

    expect(pushMock).toHaveBeenCalledWith("/admin/orders?orderStatus=CANCELLED");

    rerender(<OrdersPage />);

    await waitFor(() =>
      expect(apiRequestMock).toHaveBeenCalledWith(
        "/api/admin/orders?orderStatus=CANCELLED&limit=25",
        expect.objectContaining({ token: "token" })
      )
    );
  });
});
