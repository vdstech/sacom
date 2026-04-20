import { Router } from "express";
import * as ctrl from "./product.controller.js";
import * as cartCtrl from "../cart/cart.controller.js";

const router = Router();

router.get("/products", ctrl.list);
router.get("/products/facets", ctrl.facets);
router.get("/products/:slug", ctrl.getBySlug);
router.get("/categories/:slug/products", ctrl.listByCategorySlug);
router.get("/cart", cartCtrl.getCart);
router.post("/cart/items", cartCtrl.addCartItem);
router.patch("/cart/items/:itemId", cartCtrl.updateCartItem);
router.delete("/cart/items/:itemId", cartCtrl.removeCartItem);

export default router;
