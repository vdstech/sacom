import test from "node:test";
import assert from "node:assert/strict";
import { PHASE1_PERMISSION_DEFINITIONS } from "./seedCategoryPermissions.js";
import { ROLE_PERMISSION_CODES } from "./seedRolesUsers.js";

test("seeded permission definitions include dashboard oversight permissions", () => {
  const codes = new Set(PHASE1_PERMISSION_DEFINITIONS.map((definition) => definition.code));

  assert.equal(codes.has("order:dashboard:fulfillment:read"), true);
  assert.equal(codes.has("order:dashboard:escalations:read"), true);
});

test("order admin is seeded with both oversight dashboard permissions", () => {
  assert.equal(ROLE_PERMISSION_CODES.ORDER_ADMIN.includes("order:dashboard:fulfillment:read"), true);
  assert.equal(ROLE_PERMISSION_CODES.ORDER_ADMIN.includes("order:dashboard:escalations:read"), true);
});
