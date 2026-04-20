import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_RETURN_POLICY_TEXT,
  DEFAULT_RETURNABLE,
  DEFAULT_RETURN_WINDOW_DAYS,
  DEFAULT_SHIPPING_TEXT,
  normalizeReturnPolicyWithDefaults,
  normalizeShippingWithDefaults,
} from "./defaultMetadata.js";

test("normalizeShippingWithDefaults falls back to configured text", () => {
  assert.deepEqual(
    normalizeShippingWithDefaults({ text: "   " }),
    { text: DEFAULT_SHIPPING_TEXT }
  );
  assert.deepEqual(
    normalizeShippingWithDefaults({ text: "Custom shipping" }),
    { text: "Custom shipping" }
  );
});

test("normalizeReturnPolicyWithDefaults falls back to configured values", () => {
  assert.deepEqual(
    normalizeReturnPolicyWithDefaults({}),
    {
      text: DEFAULT_RETURN_POLICY_TEXT,
      returnable: DEFAULT_RETURNABLE,
      windowDays: DEFAULT_RETURN_WINDOW_DAYS,
    }
  );
});

test("normalizeReturnPolicyWithDefaults preserves explicit values", () => {
  assert.deepEqual(
    normalizeReturnPolicyWithDefaults({
      text: "Custom return policy",
      returnable: false,
      windowDays: 10,
    }),
    {
      text: "Custom return policy",
      returnable: false,
      windowDays: 0,
    }
  );

  assert.deepEqual(
    normalizeReturnPolicyWithDefaults({
      text: "Custom return policy",
      returnable: true,
      windowDays: "",
    }),
    {
      text: "Custom return policy",
      returnable: true,
      windowDays: DEFAULT_RETURN_WINDOW_DAYS,
    }
  );
});
