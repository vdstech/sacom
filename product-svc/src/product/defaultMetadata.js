import {
  DEFAULT_RETURN_POLICY_TEXT,
  DEFAULT_RETURNABLE,
  DEFAULT_RETURN_WINDOW_DAYS,
  DEFAULT_SHIPPING_TEXT,
} from "../../../shared/product-metadata-defaults.js";

export {
  DEFAULT_RETURN_POLICY_TEXT,
  DEFAULT_RETURNABLE,
  DEFAULT_RETURN_WINDOW_DAYS,
  DEFAULT_SHIPPING_TEXT,
};

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
