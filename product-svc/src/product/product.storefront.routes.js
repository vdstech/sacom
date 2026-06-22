import { Router } from "express";
import * as ctrl from "./product.controller.js";
import * as cartCtrl from "../cart/cart.controller.js";
import * as reviewCtrl from "../review/review.controller.js";
import { requireCustomerAuth } from "../middleware/requireCustomerAuth.js";
import { validateCreateReview, validateReviewProductId } from "../review/review.validation.js";

const router = Router();

router.get("/products", ctrl.list);
router.get("/products/facets", ctrl.facets);
router.get("/products/:productId/reviews", validateReviewProductId, reviewCtrl.listApprovedReviews);
router.get("/products/:productId/reviews/me", requireCustomerAuth, validateReviewProductId, reviewCtrl.getMyReview);
router.post("/products/:productId/reviews", requireCustomerAuth, validateCreateReview, reviewCtrl.createReview);
router.get("/products/:slug", ctrl.getBySlug);
router.get("/categories/:slug/products", ctrl.listByCategorySlug);
router.get("/cart", cartCtrl.getCart);
router.post("/cart/items", cartCtrl.addCartItem);
router.patch("/cart/items/:itemId", cartCtrl.updateCartItem);
router.delete("/cart/items/:itemId", cartCtrl.removeCartItem);

export default router;
