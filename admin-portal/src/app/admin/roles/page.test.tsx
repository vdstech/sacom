import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RolesPage from "./page";

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
  DataTable: () => <div data-testid="roles-table" />,
}));

describe("RolesPage warnings", () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({
      accessToken: "token",
      refreshAccessToken: vi.fn(),
    });

    apiRequestMock.mockImplementation((path: string) => {
      if (path === "/api/admin/roles") return Promise.resolve([]);
      if (path === "/api/admin/permissions") {
        return Promise.resolve({
          permissions: [
            { _id: "product-read", code: "product:read" },
            { _id: "product-update", code: "product:update" },
            { _id: "category-read", code: "category:read" },
            { _id: "category-update", code: "category:update" },
            { _id: "inventory-read", code: "inventory:read" },
            { _id: "inventory-update", code: "product:inventory:update" },
            { _id: "order-read", code: "order:read" },
            { _id: "order-return", code: "order:return" },
          ],
        });
      }
      return Promise.resolve({});
    });
  });

  it("shows action-without-read warnings while keeping unrestricted menu evaluation fail-open", async () => {
    render(<RolesPage />);

    await waitFor(() =>
      expect(apiRequestMock).toHaveBeenCalledWith(
        "/api/admin/permissions",
        expect.objectContaining({
          token: "token",
          service: "auth",
          onUnauthorized: expect.any(Function),
        })
      )
    );

    const permissionsSelect = screen.getByLabelText("Permissions") as HTMLSelectElement;
    const updateOption = Array.from(permissionsSelect.options).find((option) => option.value === "product-update");
    if (!updateOption) throw new Error("Expected product:update option");

    updateOption.selected = true;
    fireEvent.change(permissionsSelect);

    expect(
      await screen.findByText("`product:update` is selected, but `product:read` is missing.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeEnabled();
    expect(
      screen.queryByText("Product permissions are selected, but Products menu is not visible.")
    ).not.toBeInTheDocument();
  });

  it("shows menu warnings for explicitly limited menus", async () => {
    render(<RolesPage />);

    await waitFor(() =>
      expect(apiRequestMock).toHaveBeenCalledWith(
        "/api/admin/permissions",
        expect.objectContaining({
          token: "token",
          service: "auth",
          onUnauthorized: expect.any(Function),
        })
      )
    );

    fireEvent.click(screen.getByLabelText("Limit Visible Menus"));

    const visibleMenusSelect = screen.getByLabelText("Visible Menus") as HTMLSelectElement;
    const productsOption = Array.from(visibleMenusSelect.options).find((option) => option.value === "products");
    if (!productsOption) throw new Error("Expected products menu option");

    productsOption.selected = true;
    fireEvent.change(visibleMenusSelect);

    expect(
      await screen.findByText("Products menu is selected, but `product:read` is missing. The user may see the menu but the page may not load correctly.")
    ).toBeInTheDocument();
  });
});
