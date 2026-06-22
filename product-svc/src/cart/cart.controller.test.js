import test from "node:test";
import assert from "node:assert/strict";
import { summarizeCartItems } from "./cart.controller.js";

test("summarizeCartItems keeps subtotal inclusive and extracts GST from final discounted totals", () => {
  const summary = summarizeCartItems([
    {
      quantity: 2,
      unitPrice: 100,
      effectivePrice: 80,
      taxRate: 0.05,
    },
  ]);

  assert.equal(summary.subtotal, 160);
  assert.equal(summary.discountTotal, 40);
  assert.equal(summary.taxableBaseTotal, 152.38);
  assert.equal(summary.includedTaxTotal, 7.62);
  assert.equal(summary.priceIncludesTax, true);
  assert.equal(summary.items[0].lineTotal, 160);
});

test("summarizeCartItems falls back to the default GST rate when a variant tax rate is missing", () => {
  delete process.env.DEFAULT_PRODUCT_TAX_RATE;
  const summary = summarizeCartItems([
    {
      quantity: 1,
      unitPrice: 100,
      effectivePrice: 100,
    },
  ]);

  assert.equal(summary.items[0].taxRate, 0.05);
  assert.equal(summary.taxableBaseTotal, 95.24);
  assert.equal(summary.includedTaxTotal, 4.76);
});
