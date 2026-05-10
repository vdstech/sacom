import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { requiresPermission } from "../middleware/requiresPermission.js";
import * as controller from "./customer-orders.admin.controller.js";

const router = Router();

router.get("/dashboard", requireAuth, requiresPermission("order:read"), controller.getOrdersDashboard);
router.get("/metrics", requireAuth, requiresPermission("order:read"), controller.getOrdersMetrics);
router.get("/", requireAuth, requiresPermission("order:read"), controller.listOrders);
router.get("/operations/items", requireAuth, requiresPermission("order:read"), controller.listOrderOperationsItems);

router.get("/processing/picking-queue", requireAuth, requiresPermission(["order:read", "order:processing"]), controller.listProcessingQueue);
router.post("/:id/items/:itemId/pick", requireAuth, requiresPermission(["order:read", "order:processing"]), controller.processingPickOrderItem);
router.post("/:id/items/:itemId/handover-to-packaging", requireAuth, requiresPermission(["order:read", "order:processing"]), controller.processingHandoverToPackagingOrderItem);

router.get("/packaging/receipt-queue", requireAuth, requiresPermission(["order:read", "order:packaging"]), controller.listPackagingQueue);
router.post("/:id/items/:itemId/confirm-packaging-receipt", requireAuth, requiresPermission(["order:read", "order:packaging"]), controller.packagingConfirmReceiptOrderItem);
router.post("/:id/items/:itemId/reject-packaging-receipt", requireAuth, requiresPermission(["order:read", "order:packaging"]), controller.packagingRejectReceiptOrderItem);
router.post("/:id/items/:itemId/start-packaging", requireAuth, requiresPermission(["order:read", "order:packaging"]), controller.packagingStartOrderItem);
router.post("/:id/items/:itemId/verify-package", requireAuth, requiresPermission(["order:read", "order:packaging"]), controller.packagingVerifyOrderItem);
router.post("/:id/items/:itemId/print-label", requireAuth, requiresPermission(["order:read", "order:packaging"]), controller.packagingPrintLabelOrderItem);
router.post("/:id/items/:itemId/reprint-label", requireAuth, requiresPermission(["order:read", "order:packaging"]), controller.packagingReprintLabelOrderItem);
router.post("/:id/items/:itemId/mark-packed", requireAuth, requiresPermission(["order:read", "order:packaging"]), controller.packagingMarkPackedOrderItem);
router.post("/:id/items/:itemId/handover-to-shipping", requireAuth, requiresPermission(["order:read", "order:packaging"]), controller.packagingHandoverToShippingOrderItem);

router.get("/shipping/receipt-queue", requireAuth, requiresPermission(["order:read", "order:shipping"]), controller.listShippingQueue);
router.post("/:id/items/:itemId/confirm-shipping-receipt", requireAuth, requiresPermission(["order:read", "order:shipping"]), controller.shippingConfirmReceiptOrderItem);
router.post("/:id/items/:itemId/reject-shipping-receipt", requireAuth, requiresPermission(["order:read", "order:shipping"]), controller.shippingRejectReceiptOrderItem);
router.post("/:id/items/:itemId/start-shipping", requireAuth, requiresPermission(["order:read", "order:shipping"]), controller.shippingStartOrderItem);
router.post("/:id/items/:itemId/assign-courier", requireAuth, requiresPermission(["order:read", "order:shipping"]), controller.shippingAssignCourierOrderItem);
router.post("/:id/items/:itemId/tracking", requireAuth, requiresPermission(["order:read", "order:shipping"]), controller.shippingTrackingOrderItem);
router.post("/:id/items/:itemId/mark-shipped", requireAuth, requiresPermission(["order:read", "order:shipping"]), controller.shippingMarkShippedOrderItem);
router.post("/:id/items/:itemId/mark-delivered", requireAuth, requiresPermission(["order:read", "order:shipping"]), controller.adminMarkDeliveredOrderItem);

router.get("/cancellations/pending", requireAuth, requiresPermission(["order:read", "order:cancellation"]), controller.listCancellationQueue);
router.post("/order-items/:itemId/cancel", requireAuth, requiresPermission(["order:read", "order:admin"]), controller.adminCancelOrderItem);
router.post("/:id/items/:itemId/handover-to-cancellation", requireAuth, requiresPermission("order:read"), controller.cancellationHandoverOrderItem);
router.post("/:id/items/:itemId/confirm-cancellation-receipt", requireAuth, requiresPermission(["order:read", "order:cancellation"]), controller.cancellationConfirmReceiptOrderItem);
router.post("/:id/items/:itemId/restock-cancelled", requireAuth, requiresPermission(["order:read", "order:cancellation"]), controller.cancellationRestockOrderItem);
router.post("/:id/items/:itemId/mark-cancelled-damaged", requireAuth, requiresPermission(["order:read", "order:cancellation"]), controller.cancellationMarkDamagedOrderItem);
router.post("/:id/items/:itemId/mark-cancelled-lost", requireAuth, requiresPermission(["order:read", "order:cancellation"]), controller.cancellationMarkLostOrderItem);
router.get("/returns-exchanges", requireAuth, requiresPermission(["order:read", "order:return"]), controller.listReturnExchangeQueue);
router.post("/returns-exchanges/:caseId/start-investigation", requireAuth, requiresPermission(["order:read", "order:return"]), controller.returnExchangeStartInvestigation);
router.post("/returns-exchanges/:caseId/accept", requireAuth, requiresPermission(["order:read", "order:return"]), controller.returnExchangeAccept);
router.post("/returns-exchanges/:caseId/reject", requireAuth, requiresPermission(["order:read", "order:return"]), controller.returnExchangeReject);
router.post("/returns-exchanges/:caseId/tracking", requireAuth, requiresPermission(["order:read", "order:return"]), controller.returnExchangeUpdateTracking);
router.post("/returns-exchanges/:caseId/receive", requireAuth, requiresPermission(["order:read", "order:return"]), controller.returnExchangeReceive);
router.post("/returns-exchanges/:caseId/create-placeholder", requireAuth, requiresPermission(["order:read", "order:return"]), controller.returnExchangeCreatePlaceholder);
router.post("/returns-exchanges/:caseId/generate-coupon", requireAuth, requiresPermission(["order:read", "order:return"]), controller.returnExchangeGenerateCoupon);
router.get("/:id", requireAuth, requiresPermission("order:read"), controller.getOrder);

export default router;
