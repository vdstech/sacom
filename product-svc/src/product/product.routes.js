import { Router } from "express";
import * as ctrl from "./product.controller.js";
import { validateCreate, validateUpdate } from "./product.validation.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requiresPermission } from "../middleware/requiresPermission.js";

const router = Router();

// Public / read
router.get("/", ctrl.list);
router.get("/slug/:slug", ctrl.getBySlug);
router.get("/:id", ctrl.getById);

// Admin / write
router.post("/", requireAuth, requiresPermission("product:write"), validateCreate, ctrl.create);
router.put("/:id", requireAuth, requiresPermission("product:write"), validateUpdate, ctrl.update);
router.patch("/:id/publish", requireAuth, requiresPermission("product:publish"), ctrl.publish); // optional
router.delete("/:id", requireAuth, requiresPermission("product:delete"), ctrl.softDelete);

export default router;
