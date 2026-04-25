import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { requiresPermission } from "../middleware/requiresPermission.js";
import * as controller from "./customer-orders.admin.controller.js";

const router = Router();

router.get("/dashboard", requireAuth, requiresPermission("order:read"), controller.getOrdersDashboard);
router.get("/metrics", requireAuth, requiresPermission("order:read"), controller.getOrdersMetrics);
router.get("/", requireAuth, requiresPermission("order:read"), controller.listOrders);
router.get("/:id", requireAuth, requiresPermission("order:read"), controller.getOrder);
router.post(
  "/:id/items/:itemId/cancel",
  requireAuth,
  requiresPermission("order:write"),
  controller.cancelOrderItem
);
router.post(
  "/:id/items/:itemId/unpack-cancel",
  requireAuth,
  requiresPermission("order:write"),
  controller.unpackCancelOrderItem
);
router.patch(
  "/:id/items/:itemId",
  requireAuth,
  requiresPermission("order:write"),
  controller.updateOrderItemStatus
);

export default router;
