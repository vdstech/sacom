import { describe, expect, it } from "vitest";
import { buildRbacWarnings } from "./rbacWarnings";

describe("buildRbacWarnings", () => {
  it("warns when a menu is selected without the corresponding read permission", () => {
    const warnings = buildRbacWarnings([], ["products"]);

    expect(warnings.some((warning) => warning.type === "menu-products-missing-product-read")).toBe(true);
  });

  it("warns when an action permission is selected without the corresponding read permission", () => {
    const warnings = buildRbacWarnings(["product:update"], ["products"]);

    expect(
      warnings.some((warning) => warning.type === "permission-product-update-missing-product-read")
    ).toBe(true);
  });

  it("warns when a permission is selected without the related menu", () => {
    const warnings = buildRbacWarnings(["order:return", "order:read"], []);

    expect(
      warnings.some((warning) => warning.type === "permission-order-return-missing-returns-menu")
    ).toBe(true);
  });

  it("returns no warnings for a valid configuration", () => {
    const warnings = buildRbacWarnings(
      ["product:read", "product:update", "inventory:read", "product:inventory:update"],
      ["products", "inventory"]
    );

    expect(warnings).toEqual([]);
  });
});
