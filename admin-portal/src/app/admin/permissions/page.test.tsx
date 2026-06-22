import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  DataTable: ({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) => (
    <table>
      <thead>
        <tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {row.map((cell, cellIndex) => <td key={`${rowIndex}-${cellIndex}`}>{cell}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
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

  it("shows system protection labels for system permissions", async () => {
    apiRequestMock.mockResolvedValue({
      permissions: [
        {
          _id: "perm-1",
          code: "order:return",
          description: "Manage issue cases",
          isSystemPermission: true,
        },
      ],
    });
    useAuthMock.mockReturnValue({
      accessToken: "token",
      refreshAccessToken: vi.fn(),
      me: { systemLevel: "SUPER", user: { systemLevel: "SUPER" } },
    });

    render(<PermissionsPage />);

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalled());
    expect(screen.getByText("System protected")).toBeInTheDocument();
    expect(screen.getByText("System permission code is locked.")).toBeInTheDocument();
  });

  it("shows backend rejection messages for unsafe deletes", async () => {
    apiRequestMock
      .mockResolvedValueOnce({
        permissions: [
          {
            _id: "perm-1",
            code: "order:return",
            description: "Manage issue cases",
            isSystemPermission: true,
          },
        ],
      })
      .mockRejectedValueOnce(new Error("System permissions cannot be deleted"));
    useAuthMock.mockReturnValue({
      accessToken: "token",
      refreshAccessToken: vi.fn(),
      me: { systemLevel: "SUPER", user: { systemLevel: "SUPER" } },
    });

    render(<PermissionsPage />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.getByText("System permissions cannot be deleted")).toBeInTheDocument());
  });
});
