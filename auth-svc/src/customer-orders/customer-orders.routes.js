import express from "express";
import { requireCustomerAuth } from "../middleware/requireCustomerAuth.js";
import * as controller from "./customer-orders.controller.js";

const router = express.Router();

router.get("/coupons", requireCustomerAuth, controller.listCoupons);
router.post("/checkout/session", requireCustomerAuth, controller.createSession);
router.get("/checkout/session/:sessionId", requireCustomerAuth, controller.getSession);
router.post("/checkout/session/:sessionId/coupon/apply", requireCustomerAuth, controller.applySessionCoupon);
router.delete("/checkout/session/:sessionId/coupon", requireCustomerAuth, controller.removeSessionCoupon);
router.post("/checkout/session/:sessionId/abandon", requireCustomerAuth, controller.abandonSession);
router.post("/checkout/session/:sessionId/confirm", requireCustomerAuth, controller.confirmSession);
router.post("/", requireCustomerAuth, controller.createOrder);
router.post("/:id/cancel", requireCustomerAuth, controller.cancelOrder);
router.post("/:id/items/:itemId/cancel", requireCustomerAuth, controller.cancelOrderItem);
router.post("/:id/items/:itemId/return", requireCustomerAuth, controller.requestOrderItemReturn);
router.post("/:id/items/:itemId/exchange", requireCustomerAuth, controller.requestOrderItemExchange);
router.get("/", requireCustomerAuth, controller.listOrders);
router.get("/:id", requireCustomerAuth, controller.getOrder);

export default router;
