import { Router } from "express";
import * as ctrl from "./product.controller.js";

const router = Router();

router.get("/products", ctrl.list);
router.get("/products/:slug", ctrl.getBySlug);
router.get("/categories/:slug/products", ctrl.listByCategorySlug);

export default router;
