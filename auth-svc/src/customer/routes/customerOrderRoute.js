import express from "express";
import { requireCustomerAuth } from "../../middleware/requireCustomerAuth.js";
import * as controller from "../controllers/customerOrderController.js";

const router = express.Router();

router.get("/", requireCustomerAuth, controller.listOrders);
router.get("/:id", requireCustomerAuth, controller.getOrder);

export default router;
