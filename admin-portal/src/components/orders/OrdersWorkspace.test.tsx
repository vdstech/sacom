import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OrdersWorkspace } from "@/components/orders/OrdersWorkspace";

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

type PermissionSetup = {
  permissions: string[];
  roles?: Array<{ name: string }>;
  systemLevel?: string;
};

function buildMe({ permissions, roles = [], systemLevel = "NONE" }: PermissionSetup) {
  return {
    permissions,
    roles,
    systemLevel,
    user: { systemLevel },
  };
}

function buildOrder(itemOverrides: Record<string, unknown>) {
  return {
    id: "order-1",
    placedAt: "2026-05-01T10:00:00.000Z",
    status: "OPEN",
    paymentStatus: "PAID",
    fulfillmentStatus: "IN_PROGRESS",
    itemCount: 1,
    grandTotal: 2400,
    total: 2400,
    addressSnapshot: {
      fullName: "Asha Rao",
      line1: "MG Road",
      city: "Bengaluru",
      state: "KA",
      postalCode: "560001",
      country: "IN",
      phone: "9999999999",
    },
    items: [
      {
        id: "item-1",
        title: "Silk Saree",
        stockKey: "SKU-1",
        quantity: 1,
        fulfillmentStatus: "RESERVED",
        physicalOwner: "WAREHOUSE",
        lineGrandTotal: 2400,
        pendingHandover: null,
        ...itemOverrides,
      },
    ],
  };
}

function buildQueueResponse(itemOverrides: Record<string, unknown>) {
  return {
    items: [buildOrder(itemOverrides)],
    total: 1,
    page: 1,
    limit: 25,
    totalPages: 1,
  };
}

describe("OrdersWorkspace permissions", () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({
      accessToken: "token",
      refreshAccessToken: vi.fn(),
      me: buildMe({ permissions: [] }),
    });

    apiRequestMock.mockReset();
    apiRequestMock.mockImplementation((path: string) => {
      if (path.startsWith("/api/admin/orders/processing/picking-queue")) {
        return Promise.resolve(buildQueueResponse({ fulfillmentStatus: "RESERVED" }));
      }
      if (path.startsWith("/api/admin/orders/packaging/receipt-queue")) {
        return Promise.resolve(
          buildQueueResponse({
            fulfillmentStatus: "HANDED_TO_PACKAGING",
            physicalOwner: "PACKAGING_MANAGER",
            pendingHandover: { type: "PROCESSING_TO_PACKAGING", status: "PENDING_RECEIPT" },
          })
        );
      }
      if (path.startsWith("/api/admin/orders/shipping/receipt-queue")) {
        return Promise.resolve(
          buildQueueResponse({
            fulfillmentStatus: "HANDED_TO_SHIPPING",
            physicalOwner: "SHIPPING_OPERATOR",
            pendingHandover: { type: "PACKAGING_TO_SHIPPING", status: "PENDING_RECEIPT" },
          })
        );
      }
      if (path.startsWith("/api/admin/orders/cancellations/pending")) {
        return Promise.resolve(
          buildQueueResponse({
            fulfillmentStatus: "HANDED_TO_CANCELLATION",
            physicalOwner: "CANCELLATION_MANAGER",
          })
        );
      }
      return Promise.resolve({});
    });
  });

  it.each([
    {
      lane: "processing" as const,
      permissions: ["order:read", "order:processing"],
      expectedAction: "Pick Item",
      title: "Processing",
      subtitle: "Processing queue",
    },
    {
      lane: "packaging" as const,
      permissions: ["order:read", "order:packaging"],
      expectedAction: "Confirm Packaging Receipt",
      title: "Packaging",
      subtitle: "Packaging queue",
    },
    {
      lane: "shipping" as const,
      permissions: ["order:read", "order:shipping"],
      expectedAction: "Confirm Shipping Receipt",
      title: "Shipping",
      subtitle: "Shipping queue",
    },
    {
      lane: "cancellations" as const,
      permissions: ["order:read", "order:cancellation"],
      expectedAction: "Confirm Cancellation Receipt",
      title: "Cancellations",
      subtitle: "Cancellation queue",
    },
  ])("shows $expectedAction for a permission-driven $lane role", async ({ lane, permissions, expectedAction, title, subtitle }) => {
    useAuthMock.mockReturnValue({
      accessToken: "token",
      refreshAccessToken: vi.fn(),
      me: buildMe({ permissions }),
    });

    render(<OrdersWorkspace lane={lane} title={title} subtitle={subtitle} />);

    expect(await screen.findByRole("button", { name: expectedAction })).toBeInTheDocument();
  });

  it("does not expose Mark Delivered in the shipping workspace", async () => {
    useAuthMock.mockReturnValue({
      accessToken: "token",
      refreshAccessToken: vi.fn(),
      me: buildMe({ permissions: ["order:read", "order:shipping"] }),
    });

    render(<OrdersWorkspace lane="shipping" title="Shipping" subtitle="Shipping queue" />);

    expect(await screen.findByRole("button", { name: "Confirm Shipping Receipt" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark Delivered" })).not.toBeInTheDocument();
  });

  it("old role names no longer grant lane access without permissions", async () => {
    useAuthMock.mockReturnValue({
      accessToken: "token",
      refreshAccessToken: vi.fn(),
      me: buildMe({ permissions: [], roles: [{ name: "ORDER_OPERATIONS" }] }),
    });

    render(<OrdersWorkspace lane="processing" title="Processing" subtitle="Processing queue" />);

    expect(screen.getByText("Forbidden")).toBeInTheDocument();
    await waitFor(() => expect(apiRequestMock).not.toHaveBeenCalled());
  });

  it.each([
    {
      lane: "packaging" as const,
      permissions: ["order:read", "order:pack"],
      title: "Packaging",
      subtitle: "Packaging queue",
    },
    {
      lane: "shipping" as const,
      permissions: ["order:read", "order:ship"],
      title: "Shipping",
      subtitle: "Shipping queue",
    },
  ])("deprecated compatibility codes no longer grant $lane access by themselves", async ({ lane, permissions, title, subtitle }) => {
    useAuthMock.mockReturnValue({
      accessToken: "token",
      refreshAccessToken: vi.fn(),
      me: buildMe({ permissions }),
    });

    render(<OrdersWorkspace lane={lane} title={title} subtitle={subtitle} />);

    expect(screen.getByText("Forbidden")).toBeInTheDocument();
    await waitFor(() => expect(apiRequestMock).not.toHaveBeenCalled());
  });
});
