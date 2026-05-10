import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import PermissionsPage from "./page";

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

vi.mock("@/components/DataTable", () => ({
  DataTable: ({ rows }: { rows: unknown[][] }) => (
    <div data-testid="permission-table">{rows.length}</div>
  ),
}));

describe("PermissionsPage", () => {
  beforeEach(() => {
    apiRequestMock.mockResolvedValue({ permissions: [] });
  });

  it("shows a read-only message for non-super users", async () => {
    useAuthMock.mockReturnValue({
      accessToken: "token",
      refreshAccessToken: vi.fn(),
      me: { systemLevel: "ADMIN", user: { systemLevel: "ADMIN" } },
    });

    render(<PermissionsPage />);

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalled());
    expect(screen.getByText("Only super admins can change the permission catalog.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create" })).not.toBeInTheDocument();
  });

  it("shows the create form for super admins", async () => {
    useAuthMock.mockReturnValue({
      accessToken: "token",
      refreshAccessToken: vi.fn(),
      me: { systemLevel: "SUPER", user: { systemLevel: "SUPER" } },
    });

    render(<PermissionsPage />);

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
  });
});
