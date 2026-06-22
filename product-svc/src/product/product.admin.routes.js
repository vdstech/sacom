import { Router } from "express";
import * as ctrl from "./product.controller.js";
import { validateCreate, validateUpdate } from "./product.validation.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requiresPermission } from "../middleware/requiresPermission.js";
import { createForProduct, listForProduct, updateVariant } from "../variant/variant.controller.js";
import { validateCreate as validateVariantCreate, validateUpdate as validateVariantUpdate } from "../variant/variant.validation.js";
import { getInventoryDashboardSummary, listInventory, listLowStockInventory, listOutOfStockInventory, updateInventory } from "../inventory/inventory.controller.js";
import * as reviewCtrl from "../review/review.controller.js";
import { validateModerateReview } from "../review/review.validation.js";

const router = Router();

router.get("/", requireAuth, requiresPermission("product:read"), ctrl.adminList);
router.get("/facets", requireAuth, requiresPermission("product:read"), ctrl.adminFacets);
router.get("/inventory/dashboard-summary", requireAuth, requiresPermission("inventory:read"), getInventoryDashboardSummary);
router.get("/inventory/low-stock", requireAuth, requiresPermission("inventory:read"), listLowStockInventory);
router.get("/inventory/out-of-stock", requireAuth, requiresPermission("inventory:read"), listOutOfStockInventory);
router.get("/inventory/list", requireAuth, requiresPermission("inventory:read"), listInventory);
router.patch("/inventory/:id", requireAuth, requiresPermission("product:inventory:update"), updateInventory);
router.get("/reviews", requireAuth, requiresPermission("review:read"), reviewCtrl.adminListReviews);
router.get("/reviews/:reviewId", requireAuth, requiresPermission("review:read"), reviewCtrl.adminGetReview);
router.post("/reviews/:reviewId/approve", requireAuth, requiresPermission("review:moderate"), validateModerateReview, reviewCtrl.approveReview);
router.post("/reviews/:reviewId/reject", requireAuth, requiresPermission("review:moderate"), validateModerateReview, reviewCtrl.rejectReview);
router.post("/reviews/:reviewId/hide", requireAuth, requiresPermission("review:moderate"), validateModerateReview, reviewCtrl.hideReview);
router.post("/", requireAuth, requiresPermission("product:create"), validateCreate, ctrl.create);
router.get("/:id", requireAuth, requiresPermission("product:read"), ctrl.adminGetById);
router.put("/:id", requireAuth, requiresPermission("product:update"), validateUpdate, ctrl.update);
router.delete("/:id", requireAuth, requiresPermission("product:delete"), ctrl.softDelete);
router.patch("/:id/publish", requireAuth, requiresPermission("product:publish"), ctrl.publish);
router.get("/:id/variants", requireAuth, requiresPermission("product:read"), listForProduct);
router.post(
  "/:id/variants",
  requireAuth,
  requiresPermission("product:update"),
  validateVariantCreate,
  createForProduct
);
router.patch(
  "/:id/variants/:variantId",
  requireAuth,
  requiresPermission("product:update"),
  validateVariantUpdate,
  updateVariant
);

export default router;
