import React, { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  buildOrderOperationsProductHref,
  OrderOperationsDashboardView,
  type OrderOperationsDashboardViewProps,
} from "@/components/orders/OrderOperationsDashboard";
import type { OrderOperationsItem, OrderOperationsSummary, OrderOperationsTab } from "@/lib/orderOperationsDashboard";

const summary: OrderOperationsSummary = {
  processing: 3,
  shipping: 2,
  shipped: 1,
  delivered: 0,
};

const shippedItem: OrderOperationsItem = {
  orderId: "order-1",
  orderItemId: "item-1",
  productId: "product-1",
  slug: "silk-saree",
  productName: "Silk Saree",
  sku: "SKU-1",
  stockKey: "SKU-1",
  productPrice: 4200,
  quantity: 1,
  status: "SHIPPED",
  customerName: "Anita Rao",
  customerContact: "9999999999",
  shippingAddress: {
    fullName: "Anita Rao",
    line1: "10 MG Road",
    city: "Bengaluru",
    state: "KA",
    postalCode: "560001",
    country: "IN",
  },
  physicalOwner: "COURIER",
  courierName: "BlueDart",
  trackingNumber: "TRK-200",
  createdAt: "2026-05-01T10:00:00.000Z",
  lastUpdatedAt: "2026-05-01T12:00:00.000Z",
  shippedAt: "2026-05-01T11:00:00.000Z",
  deliveredAt: null,
  deliveredBy: "",
};

function buildProps(overrides: Partial<OrderOperationsDashboardViewProps> = {}): OrderOperationsDashboardViewProps {
  return {
    tab: "shipped",
    summary,
    items: [shippedItem],
    total: 1,
    page: 1,
    totalPages: 1,
    loading: false,
    error: "",
    actionError: "",
    searchInput: "",
    statusFilter: "",
    courierFilter: "",
    sort: "newest",
    expandedItemIds: [],
    actionBusyItemId: "",
    onTabChange: vi.fn(),
    onSearchInputChange: vi.fn(),
    onStatusFilterChange: vi.fn(),
    onCourierFilterChange: vi.fn(),
    onSortChange: vi.fn(),
    onToggleExpanded: vi.fn(),
    onRefresh: vi.fn(),
    onPreviousPage: vi.fn(),
    onNextPage: vi.fn(),
    onMarkDelivered: vi.fn(),
    ...overrides,
  };
}

function StatefulView() {
  const [tab, setTab] = useState<OrderOperationsTab>("processing");
  const items = tab === "shipped" ? [shippedItem] : [{ ...shippedItem, status: "RESERVED", orderItemId: "item-2" }];

  return (
    <OrderOperationsDashboardView
      {...buildProps({
        tab,
        items,
        onTabChange: setTab,
      })}
    />
  );
}

describe("OrderOperationsDashboardView", () => {
  it("renders tab counts and switches filters when the tab changes", () => {
    render(<StatefulView />);

    expect(screen.getByRole("button", { name: /Processing 3/i })).toBeInTheDocument();
    expect(screen.getByText("Filter by status")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Shipped 1/i }));

    expect(screen.getByText("Filter by courier")).toBeInTheDocument();
    expect(screen.queryByText("Filter by status")).not.toBeInTheDocument();
  });

  it("expands and collapses item details", () => {
    function Wrapper() {
      const [expandedItemIds, setExpandedItemIds] = useState<string[]>([]);
      return (
        <OrderOperationsDashboardView
          {...buildProps({
            expandedItemIds,
            onToggleExpanded: (itemId) =>
              setExpandedItemIds((current) => current.includes(itemId) ? [] : [itemId]),
          })}
        />
      );
    }

    render(<Wrapper />);
    expect(screen.queryByText(/Order Item ID:/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Expand Details/i }));
    expect(screen.getByText(/Order Item ID:/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Collapse Details/i }));
    expect(screen.queryByText(/Order Item ID:/i)).not.toBeInTheDocument();
  });

  it("shows mark delivered only for shipped items in the shipped tab", () => {
    const shippedProps = buildProps();
    const nonShippedProps = buildProps({
      tab: "processing",
      items: [{ ...shippedItem, status: "RESERVED" }],
    });

    const { rerender } = render(<OrderOperationsDashboardView {...shippedProps} />);
    expect(screen.getByRole("button", { name: "Mark Delivered" })).toBeInTheDocument();

    rerender(<OrderOperationsDashboardView {...nonShippedProps} />);
    expect(screen.queryByRole("button", { name: "Mark Delivered" })).not.toBeInTheDocument();
  });

  it("renders the empty state message", () => {
    render(<OrderOperationsDashboardView {...buildProps({ items: [], total: 0 })} />);
    expect(screen.getByText("No order items found")).toBeInTheDocument();
  });

  it("opens the product page in a new tab", () => {
    render(<OrderOperationsDashboardView {...buildProps()} />);
    const link = screen.getByRole("link", { name: "View Product" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("href", buildOrderOperationsProductHref("silk-saree"));
  });
});
