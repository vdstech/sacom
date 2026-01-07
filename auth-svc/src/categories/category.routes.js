import { Router } from "express";
import * as ctrl from "./category.controller.js";
import { validateCreate, validateUpdate } from "./category.validation.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requiresPermission } from "../middleware/requiresPermission.js";

const router = Router();

// READ
router.get("/", ctrl.listCategories);
router.get("/tree", ctrl.getCategoryTree);
router.get("/:id", ctrl.getCategoryById);

// WRITE (admin)
router.post("/", requireAuth, requiresPermission("category:write"), validateCreate, ctrl.createCategory);
router.put("/:id", requireAuth, requiresPermission("category:write"), validateUpdate, ctrl.updateCategory);
router.delete("/:id", requireAuth, requiresPermission("category:delete"), ctrl.deleteCategory);

export default router;
