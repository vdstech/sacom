function asNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeString(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function roundMoney(value) {
  return Math.round((asNumber(value, 0) + Number.EPSILON) * 100) / 100;
}

function clampNonNegative(value) {
  return Math.max(0, roundMoney(value));
}

function normalizeTaxRate(value, fallback = 0.05) {
  const numeric = asNumber(value, fallback);
  if (!Number.isFinite(numeric)) return fallback;
  if (numeric < 0) return 0;
  if (numeric >= 1) return fallback;
  return numeric;
}

export function calculateDiscountedPrice(price, discount) {
  const base = clampNonNegative(price);
  const type = normalizeString(discount?.type || "none").toLowerCase();
  const value = clampNonNegative(discount?.value || 0);

  if (type === "percent") {
    return clampNonNegative(base - (base * Math.min(100, value)) / 100);
  }
  if (type === "flat") {
    return clampNonNegative(base - value);
  }
  return base;
}

export function resolveDefaultProductTaxRate() {
  return normalizeTaxRate(process.env.DEFAULT_PRODUCT_TAX_RATE, 0.05);
}

export function resolveVariantTaxRate(value) {
  return normalizeTaxRate(value, resolveDefaultProductTaxRate());
}

export function resolvePricingRuleVersion() {
  return Math.max(1, Math.floor(asNumber(process.env.PRICING_RULE_VERSION, 2)));
}

function resolveStandardShippingCharge() {
  return clampNonNegative(process.env.STANDARD_SHIPPING_CHARGE || 50);
}

function resolveFreeShippingCartValue() {
  return clampNonNegative(process.env.FREE_SHIPPING_CART_VALUE || 999);
}

export function extractInclusiveTaxComponents({ inclusiveTotal = 0, taxRate = 0.05 } = {}) {
  const normalizedInclusiveTotal = clampNonNegative(inclusiveTotal);
  const normalizedTaxRate = resolveVariantTaxRate(taxRate);
  if (normalizedInclusiveTotal <= 0 || normalizedTaxRate <= 0) {
    return {
      taxableBase: normalizedInclusiveTotal,
      includedTax: 0,
    };
  }

  const taxableBase = roundMoney(normalizedInclusiveTotal / (1 + normalizedTaxRate));
  const includedTax = roundMoney(normalizedInclusiveTotal - taxableBase);

  return {
    taxableBase,
    includedTax,
  };
}

function sumLineAmount(items = [], key) {
  return roundMoney(
    (items || []).reduce((sum, item) => sum + clampNonNegative(item?.[key]), 0)
  );
}

function allocateCouponAcrossLines(items = [], couponAppliedAmount = 0) {
  const normalizedCouponAppliedAmount = clampNonNegative(couponAppliedAmount);
  if (!items.length || normalizedCouponAppliedAmount <= 0) {
    return items.map(() => 0);
  }

  const bases = items.map((item) => clampNonNegative(item?.lineGrandTotal));
  const baseTotal = roundMoney(bases.reduce((sum, value) => sum + value, 0));
  if (baseTotal <= 0) {
    return items.map(() => 0);
  }

  const cappedCouponAmount = Math.min(normalizedCouponAppliedAmount, baseTotal);
  const allocations = bases.map((base) => roundMoney((base / baseTotal) * cappedCouponAmount));
  const allocatedTotal = roundMoney(allocations.reduce((sum, value) => sum + value, 0));
  const remainder = roundMoney(cappedCouponAmount - allocatedTotal);

  if (remainder !== 0) {
    let winnerIndex = 0;
    for (let index = 1; index < bases.length; index += 1) {
      if (bases[index] > bases[winnerIndex] || (bases[index] === bases[winnerIndex] && index > winnerIndex)) {
        winnerIndex = index;
      }
    }
    allocations[winnerIndex] = roundMoney(allocations[winnerIndex] + remainder);
  }

  return allocations.map((value, index) => Math.min(clampNonNegative(value), bases[index]));
}

export function resolveShippingRule({ discountedMerchandiseTotal = 0 } = {}) {
  const subtotal = clampNonNegative(discountedMerchandiseTotal);
  const standardCharge = resolveStandardShippingCharge();
  const freeThreshold = resolveFreeShippingCartValue();
  const freeShippingApplies = subtotal >= freeThreshold;
  const shippingAmount = freeShippingApplies ? 0 : standardCharge;

  return {
    key: freeShippingApplies ? "free_threshold" : "standard_flat",
    label: freeShippingApplies
      ? `Free shipping on merchandise subtotal >= ${freeThreshold}`
      : `Standard shipping charge ${standardCharge}`,
    amount: shippingAmount,
    standardCharge,
    freeThreshold,
    eligibleSubtotal: subtotal,
    shippingTaxMode: "not_calculated_v1",
    shippingTaxTotal: 0,
  };
}

export const ORDER_PRICING_RULE_VERSION = resolvePricingRuleVersion();

export function applyPricingRules({
  items = [],
  couponAppliedAmount = 0,
  currency = "INR",
  couponCode = "",
} = {}) {
  const normalizedCurrency = normalizeString(currency, "INR") || "INR";
  const normalizedItems = Array.isArray(items) ? items : [];
  const subtotal = sumLineAmount(normalizedItems, "lineSubtotal");
  const catalogDiscountTotal = sumLineAmount(normalizedItems, "lineDiscountTotal");
  const discountedMerchandiseTotalBeforeCoupon = sumLineAmount(normalizedItems, "lineGrandTotal");
  const normalizedCouponAppliedAmount = Math.min(
    clampNonNegative(couponAppliedAmount),
    discountedMerchandiseTotalBeforeCoupon
  );
  const couponAllocations = allocateCouponAcrossLines(normalizedItems, normalizedCouponAppliedAmount);

  const pricedItems = normalizedItems.map((item, index) => {
    const quantity = Math.max(1, Math.floor(asNumber(item?.quantity, 1)));
    const taxRate = resolveVariantTaxRate(item?.taxRate);
    const lineSubtotal = clampNonNegative(item?.lineSubtotal);
    const catalogLineDiscountTotal = clampNonNegative(item?.lineDiscountTotal);
    const catalogDiscountedLineTotal = clampNonNegative(item?.lineGrandTotal);
    const couponLineDiscountTotal = clampNonNegative(couponAllocations[index]);
    const finalInclusiveLineTotal = roundMoney(
      Math.max(0, catalogDiscountedLineTotal - couponLineDiscountTotal)
    );
    const totalLineDiscount = roundMoney(catalogLineDiscountTotal + couponLineDiscountTotal);
    const { taxableBase, includedTax } = extractInclusiveTaxComponents({
      inclusiveTotal: finalInclusiveLineTotal,
      taxRate,
    });

    return {
      ...item,
      taxRate,
      priceIncludesTax: true,
      promoDiscountType: couponLineDiscountTotal > 0 ? "coupon" : normalizeString(item?.promoDiscountType || "none"),
      promoDiscountValue: couponLineDiscountTotal,
      promoDiscountLabel: couponLineDiscountTotal > 0
        ? normalizeString(couponCode || item?.promoDiscountLabel || "Order coupon")
        : normalizeString(item?.promoDiscountLabel),
      promoDiscountAmount: couponLineDiscountTotal,
      finalUnitPrice: roundMoney(quantity > 0 ? finalInclusiveLineTotal / quantity : 0),
      lineTaxableBaseTotal: taxableBase,
      lineTaxTotal: includedTax,
      lineShippingTotal: 0,
      lineDiscountTotal: totalLineDiscount,
      lineGrandTotal: finalInclusiveLineTotal,
      unitPrice: roundMoney(quantity > 0 ? finalInclusiveLineTotal / quantity : 0),
      lineTotal: finalInclusiveLineTotal,
      lineSubtotal,
    };
  });

  const discountedMerchandiseTotal = sumLineAmount(pricedItems, "lineGrandTotal");
  const taxableBaseTotal = sumLineAmount(pricedItems, "lineTaxableBaseTotal");
  const includedTaxTotal = sumLineAmount(pricedItems, "lineTaxTotal");
  const shippingRule = resolveShippingRule({ discountedMerchandiseTotal });
  const shippingTotal = clampNonNegative(shippingRule.amount);
  const payableTotal = roundMoney(discountedMerchandiseTotal + shippingTotal);
  const taxRatesUsed = [...new Set(pricedItems.map((item) => resolveVariantTaxRate(item?.taxRate)))];
  const pricingVersion = resolvePricingRuleVersion();

  return {
    currency: normalizedCurrency,
    pricingVersion,
    priceIncludesTax: true,
    subtotal,
    catalogDiscountTotal,
    couponAppliedAmount: normalizedCouponAppliedAmount,
    discountTotal: roundMoney(catalogDiscountTotal + normalizedCouponAppliedAmount),
    discountedMerchandiseTotalBeforeCoupon,
    discountedMerchandiseTotal,
    taxableBaseTotal,
    includedTaxTotal,
    shippingTotal,
    taxTotal: includedTaxTotal,
    grandTotal: payableTotal,
    payableTotal,
    items: pricedItems,
    snapshot: {
      version: pricingVersion,
      currency: normalizedCurrency,
      pricingRuleVersion: pricingVersion,
      priceIncludesTax: true,
      taxMode: "inclusive",
      subtotalBeforeCoupon: subtotal,
      catalogDiscountTotal,
      couponDiscountTotal: normalizedCouponAppliedAmount,
      discountTotal: roundMoney(catalogDiscountTotal + normalizedCouponAppliedAmount),
      discountedMerchandiseTotalBeforeCoupon,
      discountedMerchandiseTotal,
      taxableBaseTotal,
      taxTotal: includedTaxTotal,
      includedTaxTotal,
      shippingTotal,
      shippingTaxTotal: 0,
      grandTotal: payableTotal,
      payableTotal,
      allocationMode: "proportional_highest_value_remainder",
      taxRatesUsed,
      shippingRule: {
        key: shippingRule.key,
        label: shippingRule.label,
        amount: shippingTotal,
        standardCharge: shippingRule.standardCharge,
        freeThreshold: shippingRule.freeThreshold,
        eligibleSubtotal: shippingRule.eligibleSubtotal,
        shippingTaxMode: "not_calculated_v1",
        shippingTaxTotal: 0,
      },
      taxRule: {
        key: "inclusive_default_rate",
        label: "GST extracted from inclusive merchandise price",
        defaultRate: resolveDefaultProductTaxRate(),
        ratePercent: roundMoney(resolveDefaultProductTaxRate() * 100),
        amount: includedTaxTotal,
        taxMode: "inclusive",
      },
      calculatedAt: new Date(),
    },
  };
}
