import test from "node:test";
import assert from "node:assert/strict";
import {
  applyPricingRules,
  extractInclusiveTaxComponents,
} from "./customer-orders.pricing.js";

test("extractInclusiveTaxComponents derives taxable base and GST from inclusive price", () => {
  assert.deepEqual(
    extractInclusiveTaxComponents({ inclusiveTotal: 100, taxRate: 0.05 }),
    { taxableBase: 95.24, includedTax: 4.76 }
  );
});

test("applyPricingRules derives GST after catalog discount from inclusive line prices", () => {
  const pricing = applyPricingRules({
    items: [
      {
        quantity: 1,
        taxRate: 0.05,
        lineSubtotal: 100,
        lineDiscountTotal: 20,
        lineGrandTotal: 80,
      },
    ],
    couponAppliedAmount: 0,
    currency: "INR",
  });

  assert.equal(pricing.subtotal, 100);
  assert.equal(pricing.discountTotal, 20);
  assert.equal(pricing.discountedMerchandiseTotal, 80);
  assert.equal(pricing.taxableBaseTotal, 76.19);
  assert.equal(pricing.includedTaxTotal, 3.81);
  assert.equal(pricing.shippingTotal, 50);
  assert.equal(pricing.payableTotal, 130);
});

test("applyPricingRules allocates coupon proportionally before GST extraction", () => {
  const pricing = applyPricingRules({
    items: [
      {
        quantity: 1,
        taxRate: 0.05,
        lineSubtotal: 100,
        lineDiscountTotal: 20,
        lineGrandTotal: 80,
      },
      {
        quantity: 1,
        taxRate: 0.05,
        lineSubtotal: 200,
        lineDiscountTotal: 20,
        lineGrandTotal: 180,
      },
    ],
    couponAppliedAmount: 52,
    currency: "INR",
    couponCode: "EXC-123",
  });

  assert.equal(pricing.couponAppliedAmount, 52);
  assert.deepEqual(
    pricing.items.map((item) => item.lineGrandTotal),
    [64, 144]
  );
  assert.deepEqual(
    pricing.items.map((item) => item.lineTaxTotal),
    [3.05, 6.86]
  );
  assert.equal(pricing.discountedMerchandiseTotal, 208);
  assert.equal(pricing.taxableBaseTotal, 198.09);
  assert.equal(pricing.includedTaxTotal, 9.91);
  assert.equal(pricing.shippingTotal, 50);
  assert.equal(pricing.payableTotal, 258);
});

test("applyPricingRules waives shipping once discounted merchandise reaches the free-shipping threshold", () => {
  process.env.FREE_SHIPPING_CART_VALUE = "999";
  process.env.STANDARD_SHIPPING_CHARGE = "50";

  const pricing = applyPricingRules({
    items: [
      {
        quantity: 1,
        taxRate: 0.05,
        lineSubtotal: 1200,
        lineDiscountTotal: 101,
        lineGrandTotal: 1099,
      },
    ],
    couponAppliedAmount: 100,
    currency: "INR",
  });

  assert.equal(pricing.discountedMerchandiseTotal, 999);
  assert.equal(pricing.shippingTotal, 0);
  assert.equal(pricing.snapshot.shippingRule.shippingTaxMode, "not_calculated_v1");
  assert.equal(pricing.snapshot.shippingRule.shippingTaxTotal, 0);
});
