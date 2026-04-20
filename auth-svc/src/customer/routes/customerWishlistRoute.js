import express from "express";
import { requireCustomerAuth } from "../../middleware/requireCustomerAuth.js";
import * as controller from "../controllers/customerWishlistController.js";

const router = express.Router();

router.get("/", requireCustomerAuth, controller.listWishlist);
router.post("/", requireCustomerAuth, controller.addWishlistItem);
router.delete("/:productId", requireCustomerAuth, controller.removeWishlistItem);

export default router;
