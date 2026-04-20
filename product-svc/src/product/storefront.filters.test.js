import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCommercialFilters,
  buildPriceRange,
  variantMatchesCommercialFilters,
} from "./product.controller.js";

test("buildPriceRange uses effective variant prices for category bounds", () => {
  const products = [{ _id: "p1" }, { _id: "p2" }];
  const variantsByProduct = new Map([
    [
      "p1",
      [
        { price: 1000, discount: { type: "percent", value: 10 } },
        { price: 2200, discount: { type: "flat", value: 200 } },
      ],
    ],
    [
      "p2",
      [
        { price: 1500, discount: { type: "none", value: 0 } },
      ],
    ],
  ]);

  assert.deepEqual(buildPriceRange(products, variantsByProduct), { min: 900, max: 2000 });
});

test("variantMatchesCommercialFilters applies min and max price to effective price", () => {
  const filters = buildCommercialFilters({ minPrice: "900", maxPrice: "950" });
  const discountedVariant = { price: 1000, discount: { type: "percent", value: 10 } };
  const fullPriceVariant = { price: 1000, discount: { type: "none", value: 0 } };

  assert.equal(variantMatchesCommercialFilters(discountedVariant, filters), true);
  assert.equal(variantMatchesCommercialFilters(fullPriceVariant, filters), false);
});

test("variantMatchesCommercialFilters respects discount type and value bounds", () => {
  const filters = buildCommercialFilters({
    discountType: "percent",
    discountMin: "15",
    discountMax: "25",
  });

  assert.equal(
    variantMatchesCommercialFilters({ price: 1000, discount: { type: "percent", value: 20 } }, filters),
    true
  );
  assert.equal(
    variantMatchesCommercialFilters({ price: 1000, discount: { type: "flat", value: 200 } }, filters),
    false
  );
  assert.equal(
    variantMatchesCommercialFilters({ price: 1000, discount: { type: "percent", value: 10 } }, filters),
    false
  );
});
