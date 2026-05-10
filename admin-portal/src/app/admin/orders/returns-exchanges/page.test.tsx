import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ReturnExchangeOrdersPage from "./page";

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

vi.mock("@/components/PaginationControls", () => ({
  PaginationControls: () => <div data-testid="pagination-controls" />,
}));

function buildMe(permissions: string[], systemLevel = "NONE") {
  return {
    permissions,
    roles: [],
    systemLevel,
    user: { systemLevel },
  };
}

describe("ReturnExchangeOrdersPage permissions", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    apiRequestMock.mockImplementation((path: string) => {
      if (path.startsWith("/api/admin/orders/returns-exchanges?")) {
        return Promise.resolve({
          items: [
            {
              caseId: "case-1",
              kind: "RETURN",
              orderItemId: "item-1",
              productName: "Silk Saree",
              reason: "Damaged",
              status: "RETURN_REQUESTED",
              order: {
                id: "order-1",
                addressSnapshot: {
                  fullName: "Asha Rao",
                  line1: "MG Road",
                  city: "Bengaluru",
                  state: "KA",
                  postalCode: "560001",
                  country: "IN",
                },
              },
              orderItem: {
                id: "item-1",
                title: "Silk Saree",
                quantity: 1,
              },
            },
          ],
          total: 1,
          page: 1,
          limit: 25,
          totalPages: 1,
        });
      }
      return Promise.resolve({});
    });
  });

  it("allows return/exchange UI for roles with order:read and order:return", async () => {
    useAuthMock.mockReturnValue({
      accessToken: "token",
      refreshAccessToken: vi.fn(),
      me: buildMe(["order:read", "order:return"]),
    });

    render(<ReturnExchangeOrdersPage />);

    expect(await screen.findByRole("button", { name: "Start Investigation" })).toBeInTheDocument();
  });

  it("does not allow return/exchange UI with only order:return", async () => {
    useAuthMock.mockReturnValue({
      accessToken: "token",
      refreshAccessToken: vi.fn(),
      me: buildMe(["order:return"]),
    });

    render(<ReturnExchangeOrdersPage />);

    expect(screen.getByText("Forbidden")).toBeInTheDocument();
    await waitFor(() => expect(apiRequestMock).not.toHaveBeenCalled());
  });
});
