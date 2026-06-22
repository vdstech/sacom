import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AuditPage from "./page";

const useAuthMock = vi.fn();
const apiRequestMock = vi.fn();
const pushMock = vi.fn();
let currentQuery = "";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/audit",
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

vi.mock("@/components/DataTable", () => ({
  DataTable: ({ rows }: { rows: unknown[][] }) => (
    <div data-testid="audit-table">
      {rows.map((row, index) => <div key={index}>{row.join(" | ")}</div>)}
    </div>
  ),
}));

vi.mock("@/components/PaginationControls", () => ({
  PaginationControls: () => <div data-testid="audit-pagination" />,
}));

describe("AuditPage", () => {
  beforeEach(() => {
    currentQuery = "";
    pushMock.mockReset();
    pushMock.mockImplementation((nextUrl: string) => {
      currentQuery = nextUrl.split("?")[1] || "";
    });
    apiRequestMock.mockReset();
    apiRequestMock.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 25,
      totalPages: 1,
    });
    useAuthMock.mockReturnValue({
      accessToken: "token",
      refreshAccessToken: vi.fn(),
    });
  });

  it("loads audit logs with URL filters", async () => {
    currentQuery = "action=USER_UPDATED&result=SUCCESS";

    apiRequestMock.mockResolvedValueOnce({
      items: [{
        id: "audit-1",
        timestamp: "2026-06-01T10:00:00.000Z",
        service: "auth-svc",
        action: "MANUAL_EXTERNAL_RESOLUTION_NOTED",
        entityType: "ORDER_ITEM",
        entityId: "item-1",
        entityDisplayId: "ORD-1",
        actor: { actorType: "USER", userId: "user-1", email: "admin@example.com", name: "Admin", role: "ADMIN", roleNames: ["ADMIN"] },
        request: { requestId: "req-1", method: "POST", path: "/api/admin/orders/returns-exchanges", ipAddress: "", userAgent: "" },
        result: "SUCCESS",
        failureReason: "",
      }],
      total: 1,
      page: 1,
      limit: 25,
      totalPages: 1,
    });

    render(<AuditPage />);

    await waitFor(() =>
      expect(apiRequestMock).toHaveBeenCalledWith(
        "/api/admin/audit?page=1&limit=25&action=USER_UPDATED&result=SUCCESS",
        expect.objectContaining({ token: "token" })
      )
    );
    expect(await screen.findByText(/Manual External Resolution Noted/)).toBeInTheDocument();
  });

  it("applies filters by pushing the new query", async () => {
    render(<AuditPage />);

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText("Actor"), { target: { value: "admin@example.com" } });
    fireEvent.change(screen.getByLabelText("Action"), { target: { value: "user_updated" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(pushMock).toHaveBeenCalledWith("/admin/audit?page=1&actor=admin%40example.com&action=USER_UPDATED");
  });
});
