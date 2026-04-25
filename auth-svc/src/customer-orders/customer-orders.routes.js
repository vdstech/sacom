import express from "express";
import { requireCustomerAuth } from "../middleware/requireCustomerAuth.js";
import * as controller from "./customer-orders.controller.js";

const router = express.Router();

router.post("/", requireCustomerAuth, controller.createOrder);
router.post("/:id/cancel", requireCustomerAuth, controller.cancelOrder);
router.post("/:id/items/:itemId/cancel", requireCustomerAuth, controller.cancelOrderItem);
router.post("/:id/items/:itemId/return", requireCustomerAuth, controller.requestOrderItemReturn);
router.get("/", requireCustomerAuth, controller.listOrders);
router.get("/:id", requireCustomerAuth, controller.getOrder);

export default router;
