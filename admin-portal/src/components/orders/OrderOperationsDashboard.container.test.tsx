import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OrderOperationsDashboard } from "@/components/orders/OrderOperationsDashboard";

const useAuthMock = vi.fn();
const apiRequestMock = vi.fn();

vi.mock("@/lib/auth", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/lib/api", () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
}));

vi.mock("@/components/ProtectedPage", () => ({
  ProtectedPage: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/PaginationControls", () => ({
  PaginationControls: () => <div data-testid="pagination-controls" />,
}));

describe("OrderOperationsDashboard container", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    apiRequestMock.mockResolvedValue({
      summary: { processing: 0, shipping: 0, shipped: 0, delivered: 0 },
      items: [],
      total: 0,
      page: 1,
      limit: 25,
      totalPages: 1,
    });
  });

  it("remains admin-only for shipping users", async () => {
    useAuthMock.mockReturnValue({
      accessToken: "token",
      refreshAccessToken: vi.fn(),
      me: {
        permissions: ["order:read", "order:shipping"],
        roles: [{ name: "SHIPPING_OPERATOR" }],
        systemLevel: "NONE",
        user: { systemLevel: "NONE" },
      },
    });

    render(<OrderOperationsDashboard />);

    expect(screen.getByText("Forbidden")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark Delivered" })).not.toBeInTheDocument();
    await waitFor(() => expect(apiRequestMock).not.toHaveBeenCalled());
  });

  it("loads the dashboard for admin users", async () => {
    useAuthMock.mockReturnValue({
      accessToken: "token",
      refreshAccessToken: vi.fn(),
      me: {
        permissions: [],
        roles: [{ name: "ADMIN" }],
        systemLevel: "ADMIN",
        user: { systemLevel: "ADMIN" },
      },
    });

    render(<OrderOperationsDashboard />);

    await waitFor(() =>
      expect(apiRequestMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/admin/orders/operations/items?"),
        expect.objectContaining({
          token: "token",
          onUnauthorized: expect.any(Function),
        })
      )
    );
  });
});
