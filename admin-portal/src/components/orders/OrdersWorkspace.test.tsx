import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OrdersWorkspace } from "@/components/orders/OrdersWorkspace";

const useAuthMock = vi.fn();
const apiRequestMock = vi.fn();

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/orders/processing",
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
  PaginationControls: ({
    page,
    totalPages,
    total,
    onPrevious,
    onNext,
    previousLabel,
    nextLabel,
  }: {
    page: number;
    totalPages: number;
    total: number;
    onPrevious: () => void;
    onNext: () => void;
    previousLabel: string;
    nextLabel: string;
  }) => (
    <div data-testid="pagination-controls">
      <span>{`Total rows: ${total}`}</span>
      <button type="button" onClick={onPrevious} disabled={page <= 1}>{previousLabel}</button>
      <span>{`Page ${page} of ${totalPages}`}</span>
      <button type="button" onClick={onNext} disabled={page >= totalPages}>{nextLabel}</button>
    </div>
  ),
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

function expandTaskSection(section: HTMLElement) {
  const expandButton = within(section).queryByRole("button", { name: "Expand Details" });
  if (expandButton) fireEvent.click(expandButton);
}

async function expandAllTaskSections() {
  const expandButtons = await screen.findAllByRole("button", { name: "Expand Details" });
  expandButtons.forEach((button) => fireEvent.click(button));
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

    if (expectedAction !== "Confirm Cancellation Receipt") {
      await expandAllTaskSections();
    }
    expect((await screen.findAllByRole("button", { name: expectedAction })).length).toBeGreaterThan(0);
  });

  it("does not expose Mark Delivered in the shipping workspace", async () => {
    useAuthMock.mockReturnValue({
      accessToken: "token",
      refreshAccessToken: vi.fn(),
      me: buildMe({ permissions: ["order:read", "order:shipping"] }),
    });

    render(<OrdersWorkspace lane="shipping" title="Shipping" subtitle="Shipping queue" />);

    await expandAllTaskSections();
    expect((await screen.findAllByRole("button", { name: "Confirm Shipping Receipt" })).length).toBeGreaterThan(0);
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

describe("Processing task board", () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({
      accessToken: "token",
      refreshAccessToken: vi.fn(),
      me: buildMe({ permissions: ["order:read", "order:processing"] }),
    });

    apiRequestMock.mockReset();
  });

  it("shows a picked item in only the ready-to-handover section", async () => {
    apiRequestMock.mockResolvedValue(
      buildQueueResponse({
        fulfillmentStatus: "PICKED_FROM_WAREHOUSE",
        physicalOwner: "PROCESSING_MANAGER",
      })
    );

    render(<OrdersWorkspace lane="processing" title="Processing" subtitle="Processing queue" />);

    expect((await screen.findAllByText("Pending Picking")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("Picked / Ready For Handover")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("Cancellation Requested")).length).toBeGreaterThan(0);

    const pendingSection = (await screen.findAllByText("Pending Picking"))[1]?.closest("article") || null;
    const readySection = (await screen.findAllByText("Picked / Ready For Handover"))[1]?.closest("article") || null;
    const exceptionsSection = screen.getAllByText("Cancellation Requested")[1]?.closest("article") || null;

    expect(pendingSection).not.toBeNull();
    expect(readySection).not.toBeNull();
    expect(exceptionsSection).not.toBeNull();

    expandTaskSection(readySection as HTMLElement);
    expect(within(pendingSection as HTMLElement).queryByText("Silk Saree")).not.toBeInTheDocument();
    expect(within(exceptionsSection as HTMLElement).queryByText("Silk Saree")).not.toBeInTheDocument();
    expect(within(readySection as HTMLElement).getByText(/Silk Saree/)).toBeInTheDocument();
    expect(within(readySection as HTMLElement).getAllByRole("button", { name: "Handover To Packaging" })).toHaveLength(1);
    expect(within(readySection as HTMLElement).getByText("SKU-1 • Qty 1 • Picked From Warehouse")).toBeInTheDocument();
  });

  it("requests processed lane history and expands task-row order details inline", async () => {
    apiRequestMock.mockResolvedValue(
      buildQueueResponse({
        fulfillmentStatus: "PICKED_FROM_WAREHOUSE",
        physicalOwner: "PROCESSING_MANAGER",
      })
    );

    render(<OrdersWorkspace lane="processing" title="Processing" subtitle="Processing queue" />);

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        expect.stringContaining("includeCompleted=1"),
        expect.any(Object)
      );
    });

    const readySection = (await screen.findAllByText("Picked / Ready For Handover"))[1]?.closest("article") || null;
    expect(readySection).not.toBeNull();

    expandTaskSection(readySection as HTMLElement);
    const openButton = within(readySection as HTMLElement).getByRole("button", { name: "Open order details" });
    fireEvent.click(openButton);

    expect(within(readySection as HTMLElement).getByText("Shipping Address")).toBeInTheDocument();
    expect(within(readySection as HTMLElement).getByText("Asha Rao")).toBeInTheDocument();
    expect(within(readySection as HTMLElement).getAllByRole("button", { name: "Collapse Details" }).length).toBeGreaterThan(0);
  });

  it("shows already processed processing items in the processed orders bucket", async () => {
    apiRequestMock.mockResolvedValue(
      buildQueueResponse({
        fulfillmentStatus: "PACKAGING_RECEIVED",
        physicalOwner: "PACKAGING_MANAGER",
        pickedAt: "2026-05-01T11:00:00.000Z",
        handedToPackagingAt: "2026-05-01T12:00:00.000Z",
        packagingReceivedAt: "2026-05-01T12:30:00.000Z",
      })
    );

    render(<OrdersWorkspace lane="processing" title="Processing" subtitle="Processing queue" />);

    expect((await screen.findAllByText("Processed Orders")).length).toBeGreaterThan(0);
    const processedSection = (await screen.findAllByText("Processed Orders"))[1]?.closest("article") || null;

    expect(processedSection).not.toBeNull();
    expandTaskSection(processedSection as HTMLElement);
    expect(within(processedSection as HTMLElement).getByText(/Silk Saree/)).toBeInTheDocument();
    expect(within(processedSection as HTMLElement).queryByRole("button", { name: "Handover To Packaging" })).not.toBeInTheDocument();
  });

  it("keeps task sections collapsed until a user expands them", async () => {
    apiRequestMock.mockResolvedValue(
      buildQueueResponse({
        fulfillmentStatus: "RESERVED",
        physicalOwner: "WAREHOUSE",
      })
    );

    render(<OrdersWorkspace lane="processing" title="Processing" subtitle="Processing queue" />);

    const pendingSection = (await screen.findAllByText("Pending Picking"))[1]?.closest("article") || null;
    expect(pendingSection).not.toBeNull();
    expect(within(pendingSection as HTMLElement).queryByText(/Silk Saree/)).not.toBeInTheDocument();

    expandTaskSection(pendingSection as HTMLElement);

    expect(within(pendingSection as HTMLElement).getByText(/Silk Saree/)).toBeInTheDocument();
    expect(within(pendingSection as HTMLElement).getByRole("button", { name: "Pick Item" })).toBeInTheDocument();
  });

  it("paginates large task buckets so later sections remain reachable", async () => {
    apiRequestMock.mockResolvedValue({
      items: [
        {
          ...buildOrder({}),
          items: Array.from({ length: 12 }, (_, index) => ({
            id: `item-${index + 1}`,
            title: `Pending Item ${index + 1}`,
            stockKey: `SKU-${index + 1}`,
            quantity: 1,
            fulfillmentStatus: "RESERVED",
            physicalOwner: "WAREHOUSE",
            lineGrandTotal: 2400,
            pendingHandover: null,
          })),
        },
      ],
      total: 1,
      page: 1,
      limit: 25,
      totalPages: 1,
    });

    render(<OrdersWorkspace lane="processing" title="Processing" subtitle="Processing queue" />);

    const pendingSection = (await screen.findAllByText("Pending Picking"))[1]?.closest("article") || null;
    expect(pendingSection).not.toBeNull();
    expandTaskSection(pendingSection as HTMLElement);
    expect(within(pendingSection as HTMLElement).getByText(/Pending Item 10/)).toBeInTheDocument();
    expect(within(pendingSection as HTMLElement).queryByText(/Pending Item 11/)).not.toBeInTheDocument();

    fireEvent.click(within(pendingSection as HTMLElement).getByRole("button", { name: "Next" }));

    expect(within(pendingSection as HTMLElement).getByText(/Pending Item 11/)).toBeInTheDocument();
    expect(within(pendingSection as HTMLElement).queryByText(/Pending Item 10/)).not.toBeInTheDocument();
  });

  it("keeps cancellation-requested processing items in exceptions with cancellation handover action", async () => {
    apiRequestMock.mockResolvedValue(
      buildQueueResponse({
        fulfillmentStatus: "CANCEL_REQUESTED",
        physicalOwner: "PROCESSING_MANAGER",
      })
    );

    render(<OrdersWorkspace lane="processing" title="Processing" subtitle="Processing queue" />);

    expect((await screen.findAllByText("Cancellation Requested")).length).toBeGreaterThan(0);
    await expandAllTaskSections();
    expect((await screen.findAllByRole("button", { name: "Handover To Cancellation" })).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Pick Item" })).not.toBeInTheDocument();
  });

  it("prints all pending items by default and supports select all", async () => {
    apiRequestMock.mockResolvedValue({
      items: [
        {
          ...buildOrder({
            id: "item-1",
            title: "Silk Saree",
            stockKey: "SKU-1",
            fulfillmentStatus: "RESERVED",
          }),
        },
      ],
      total: 1,
      page: 1,
      limit: 25,
      totalPages: 1,
    });

    const printSpy = vi.spyOn(window, "print").mockImplementation(() => undefined);
    render(<OrdersWorkspace lane="processing" title="Processing" subtitle="Processing queue" />);

    expect((await screen.findAllByText("Pending Picking")).length).toBeGreaterThan(0);
    expect(screen.getByText("Prints all 1 items in this bucket when nothing is selected.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Print Pick List" }));
    expect(printSpy).toHaveBeenCalledTimes(1);

    const pendingSection = (await screen.findAllByText("Pending Picking"))[1]?.closest("article") || null;
    expect(pendingSection).not.toBeNull();
    fireEvent.click(within(pendingSection as HTMLElement).getByRole("button", { name: "Select All" }));
    expect(screen.getByText("1 selected for printing")).toBeInTheDocument();
    printSpy.mockRestore();
  });

  it("keeps packaging items in mutually exclusive packaging buckets", async () => {
    useAuthMock.mockReturnValue({
      accessToken: "token",
      refreshAccessToken: vi.fn(),
      me: buildMe({ permissions: ["order:read", "order:packaging"] }),
    });

    apiRequestMock.mockResolvedValue(
      buildQueueResponse({
        fulfillmentStatus: "PACKED",
        physicalOwner: "PACKAGING_MANAGER",
      })
    );

    render(<OrdersWorkspace lane="packaging" title="Packaging" subtitle="Packaging queue" />);

    expect((await screen.findAllByText("Received / Pending Packaging")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("Packaged / Ready For Shipping Handover")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("Cancellation Requested")).length).toBeGreaterThan(0);

    const pendingSection = (await screen.findAllByText("Received / Pending Packaging"))[1]?.closest("article") || null;
    const readySection = (await screen.findAllByText("Packaged / Ready For Shipping Handover"))[1]?.closest("article") || null;

    expect(pendingSection).not.toBeNull();
    expect(readySection).not.toBeNull();
    expandTaskSection(readySection as HTMLElement);
    expect(within(pendingSection as HTMLElement).queryByText("Silk Saree")).not.toBeInTheDocument();
    expect(within(readySection as HTMLElement).getByText(/Silk Saree/)).toBeInTheDocument();
    expect(within(readySection as HTMLElement).getAllByRole("button", { name: "Handover To Shipping" })).toHaveLength(1);
  });

  it("shows Package Item as the only packaging work action for in-progress packaging items", async () => {
    useAuthMock.mockReturnValue({
      accessToken: "token",
      refreshAccessToken: vi.fn(),
      me: buildMe({ permissions: ["order:read", "order:packaging"] }),
    });

    apiRequestMock.mockResolvedValue(
      buildQueueResponse({
        fulfillmentStatus: "PACKAGING_IN_PROGRESS",
        physicalOwner: "PACKAGING_MANAGER",
        packageVerificationStatus: "PENDING",
        labelStatus: "NOT_PRINTED",
      })
    );

    render(<OrdersWorkspace lane="packaging" title="Packaging" subtitle="Packaging queue" />);

    await expandAllTaskSections();
    expect((await screen.findAllByRole("button", { name: "Package Item" })).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Verify Package" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Print Label" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark Packed" })).not.toBeInTheDocument();
  });

  it("keeps shipped items in the completed shipping bucket", async () => {
    useAuthMock.mockReturnValue({
      accessToken: "token",
      refreshAccessToken: vi.fn(),
      me: buildMe({ permissions: ["order:read", "order:shipping"] }),
    });

    apiRequestMock.mockResolvedValue(
      buildQueueResponse({
        fulfillmentStatus: "SHIPPED",
        physicalOwner: "COURIER",
      })
    );

    render(<OrdersWorkspace lane="shipping" title="Shipping" subtitle="Shipping queue" />);

    const completedSection = (await screen.findAllByText("Shipped / Completed"))[1]?.closest("article");
    const pendingSection = (await screen.findAllByText("Received / Pending Shipping"))[1]?.closest("article") || null;

    expect(completedSection).not.toBeNull();
    expect(pendingSection).not.toBeNull();
    expandTaskSection(completedSection as HTMLElement);
    expect(within(completedSection as HTMLElement).getByText(/Silk Saree/)).toBeInTheDocument();
    expect(within(pendingSection as HTMLElement).queryByText("Silk Saree")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark Delivered" })).not.toBeInTheDocument();
  });

  it("shows Ship Item as the only shipping work action for in-progress shipping items", async () => {
    useAuthMock.mockReturnValue({
      accessToken: "token",
      refreshAccessToken: vi.fn(),
      me: buildMe({ permissions: ["order:read", "order:shipping"] }),
    });

    apiRequestMock.mockResolvedValue(
      buildQueueResponse({
        fulfillmentStatus: "SHIPPING_IN_PROGRESS",
        physicalOwner: "SHIPPING_OPERATOR",
        courierName: "",
        outboundTrackingNumber: "",
      })
    );

    render(<OrdersWorkspace lane="shipping" title="Shipping" subtitle="Shipping queue" />);

    await expandAllTaskSections();
    expect((await screen.findAllByRole("button", { name: "Ship Item" })).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Assign Courier" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enter Tracking Number" })).not.toBeInTheDocument();
  });

  it("submits courier and tracking through the combined ship endpoint", async () => {
    useAuthMock.mockReturnValue({
      accessToken: "token",
      refreshAccessToken: vi.fn(),
      me: buildMe({ permissions: ["order:read", "order:shipping"] }),
    });

    apiRequestMock.mockImplementation((path: string) => {
      if (path.startsWith("/api/admin/orders/shipping/receipt-queue")) {
        return Promise.resolve(
          buildQueueResponse({
            fulfillmentStatus: "SHIPPING_IN_PROGRESS",
            physicalOwner: "SHIPPING_OPERATOR",
            courierName: "",
            outboundTrackingNumber: "",
          })
        );
      }
      if (path.includes("/items/item-1/ship")) {
        return Promise.resolve({
          order: buildOrder({
            fulfillmentStatus: "SHIPPED",
            physicalOwner: "COURIER",
            courierName: "BlueDart",
            outboundTrackingNumber: "TRK-100",
          }),
        });
      }
      return Promise.resolve(
        buildQueueResponse({
          fulfillmentStatus: "SHIPPED",
          physicalOwner: "COURIER",
          courierName: "BlueDart",
          outboundTrackingNumber: "TRK-100",
        })
      );
    });

    render(<OrdersWorkspace lane="shipping" title="Shipping" subtitle="Shipping queue" />);

    await expandAllTaskSections();
    const shipButtons = await screen.findAllByRole("button", { name: "Ship Item" });
    fireEvent.click(shipButtons[0]);

    const dialog = await screen.findByRole("dialog");
    const fields = within(dialog).getAllByRole("textbox");
    fireEvent.change(fields[0], { target: { value: "BlueDart" } });
    fireEvent.change(fields[1], { target: { value: "TRK-100" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Ship Item" }));

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/admin/orders/order-1/items/item-1/ship"),
        expect.objectContaining({
          method: "POST",
          body: expect.objectContaining({
            courierName: "BlueDart",
            trackingNumber: "TRK-100",
          }),
        })
      );
    });
  });
});
