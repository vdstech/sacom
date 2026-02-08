import { Router } from "express";
import * as ctrl from "./product.controller.js";
import { validateCreate, validateUpdate } from "./product.validation.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requiresPermission } from "../middleware/requiresPermission.js";
import { createForProduct, listForProduct, updateVariant } from "../variant/variant.controller.js";
import { validateCreate as validateVariantCreate, validateUpdate as validateVariantUpdate } from "../variant/variant.validation.js";
import { listInventory, updateInventory } from "../inventory/inventory.controller.js";

const router = Router();

router.get("/", requireAuth, requiresPermission("product:read"), ctrl.adminList);
router.get("/inventory/list", requireAuth, requiresPermission("inventory:read"), listInventory);
router.patch("/inventory/:id", requireAuth, requiresPermission("inventory:write"), updateInventory);
router.post("/", requireAuth, requiresPermission("product:write"), validateCreate, ctrl.create);
router.get("/:id", requireAuth, requiresPermission("product:read"), ctrl.adminGetById);
router.put("/:id", requireAuth, requiresPermission("product:write"), validateUpdate, ctrl.update);
router.delete("/:id", requireAuth, requiresPermission("product:delete"), ctrl.softDelete);
router.patch("/:id/publish", requireAuth, requiresPermission("product:publish"), ctrl.publish);
router.get("/:id/variants", requireAuth, requiresPermission("product:read"), listForProduct);
router.post(
  "/:id/variants",
  requireAuth,
  requiresPermission("product:write"),
  validateVariantCreate,
  createForProduct
);
router.patch(
  "/:id/variants/:variantId",
  requireAuth,
  requiresPermission("product:write"),
  validateVariantUpdate,
  updateVariant
);

export default router;
