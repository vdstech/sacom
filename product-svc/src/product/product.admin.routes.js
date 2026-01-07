import { Router } from "express";
import * as ctrl from "./product.controller.js";
import { validateCreate, validateUpdate } from "./product.validation.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requiresPermission } from "../middleware/requiresPermission.js";
import { createForProduct } from "../variant/variant.controller.js";
import { validateCreate as validateVariantCreate } from "../variant/variant.validation.js";

const router = Router();

router.post("/", requireAuth, requiresPermission("product:write"), validateCreate, ctrl.create);
router.put("/:id", requireAuth, requiresPermission("product:write"), validateUpdate, ctrl.update);
router.post(
  "/:id/variants",
  requireAuth,
  requiresPermission("product:write"),
  validateVariantCreate,
  createForProduct
);

export default router;
