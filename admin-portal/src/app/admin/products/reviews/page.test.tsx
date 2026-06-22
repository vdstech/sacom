import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProductReviewsPage from "./page";

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

describe("ProductReviewsPage", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    apiRequestMock.mockImplementation((path: string) => {
      if (path.startsWith("/api/admin/products/reviews?")) {
        return Promise.resolve({
          items: [
            {
              id: "review-1",
              productId: "product-1",
              customerDisplayName: "Asha Rao",
              rating: 5,
              title: "Beautiful drape",
              comment: "The fabric quality was excellent and worth the purchase.",
              verifiedBuyer: true,
              status: "PENDING",
              automatedModeration: {
                provider: "OPENAI",
                model: "omni-moderation-latest",
                decision: "PENDING",
                reason: "AUTOMATED_MODERATION_FLAGGED",
                categories: ["harassment"],
                scores: { harassment: 0.91 },
                checkedAt: "2026-06-22T10:00:00.000Z",
              },
              product: { id: "product-1", title: "Silk Saree", slug: "silk-saree" },
              verificationOrder: { id: "order-1", displayId: "ORD-1001" },
            },
          ],
          total: 1,
          page: 1,
          limit: 25,
          totalPages: 1,
        });
      }
      if (path === "/api/admin/products/reviews/review-1/approve") {
        return Promise.resolve({ review: { id: "review-1", status: "APPROVED" } });
      }
      return Promise.resolve({});
    });
  });

  it("renders moderation details and submits approve action", async () => {
    useAuthMock.mockReturnValue({
      accessToken: "token",
      refreshAccessToken: vi.fn(),
      me: {
        permissions: ["review:read", "review:moderate"],
        systemLevel: "NONE",
        user: { systemLevel: "NONE" },
      },
    });

    render(<ProductReviewsPage />);

    expect((await screen.findAllByText("Silk Saree")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Asha Rao").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Verified Buyer/i).length).toBeGreaterThan(0);
    expect(screen.getByText("OPENAI")).toBeInTheDocument();
    expect(screen.getByText("harassment")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Moderation reason"), { target: { value: "Looks valid" } });
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() =>
      expect(apiRequestMock).toHaveBeenCalledWith(
        "/api/admin/products/reviews/review-1/approve",
        expect.objectContaining({
          service: "product",
          method: "POST",
          body: {
            moderationReason: "Looks valid",
            moderationNote: "",
          },
        })
      )
    );
  });
});
