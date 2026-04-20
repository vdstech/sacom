export const DEFAULT_SHIPPING_TEXT = [
  "For orders placed before 1.00 PM , we endeavor to process the same business day. Orders placed after 1.00 PM shall be processed the next business day.",
  "Please Check the Description for Shipping Times as Some Products Shall be Dispatched after 5-12 days from the date of Order Received as these are made to order Products.",
  "During sale events and new collection launches, there may be a slightly longer processing time.",
  "All orders are hand-picked and packed with love from Siri Collections Team.",
].join("\n");

export const DEFAULT_RETURN_POLICY_TEXT = [
  "Items(s) approved for exchange/return must be returned in their original condition and packaging: unworn, unwashed and with all tags attached.",
  "Fashion Jewellery, Fabric, Lehenga Sets, Blouse items are not qualified for return/exchange.",
  "Return shipping methods and associated costs are the responsibility of the customer.",
  "All Handloom Products have some sort of irregularities such as slight threads misplacing etc., and these cannot be treated as damages",
  "Sale items can not be refunded for change of mind.",
  "For more detailed information on return policy, please visit https://siricollections.in/pages/return-policy",
].join("\n");

export const DEFAULT_RETURNABLE = true;
export const DEFAULT_RETURN_WINDOW_DAYS = 7;

function normalizeString(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function asNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function hasOwn(input, key) {
  return !!input && typeof input === "object" && Object.prototype.hasOwnProperty.call(input, key);
}

export function normalizeShippingWithDefaults(input = {}) {
  return {
    text: normalizeString(input?.text) || DEFAULT_SHIPPING_TEXT,
  };
}

export function normalizeReturnPolicyWithDefaults(input = {}) {
  const text = normalizeString(input?.text) || DEFAULT_RETURN_POLICY_TEXT;
  const returnable = hasOwn(input, "returnable") ? !!input.returnable : DEFAULT_RETURNABLE;
  const defaultWindow = returnable ? DEFAULT_RETURN_WINDOW_DAYS : 0;
  const hasWindowDays = hasOwn(input, "windowDays") && normalizeString(input?.windowDays) !== "";
  const windowDays = returnable
    ? Math.max(1, hasWindowDays ? asNumber(input.windowDays, DEFAULT_RETURN_WINDOW_DAYS) : defaultWindow)
    : 0;

  return {
    text,
    returnable,
    windowDays,
  };
}
