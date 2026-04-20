import express from "express";
import { requireCustomerAuth } from "../../middleware/requireCustomerAuth.js";
import * as controller from "../controllers/customerAddressController.js";

const router = express.Router();

router.get("/", requireCustomerAuth, controller.listAddresses);
router.post("/", requireCustomerAuth, controller.createAddress);
router.patch("/:id", requireCustomerAuth, controller.updateAddress);
router.delete("/:id", requireCustomerAuth, controller.deleteAddress);

export default router;
