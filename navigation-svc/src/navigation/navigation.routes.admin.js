import { Router } from "express";
import {
  adminList,
  adminCreate,
  adminUpdate,
  adminDelete,
  adminReorderChildren,
} from "./navigation.controller.js";

import { validateBody } from "./navigation.middleware.js";
import { createNavSchema, updateNavSchema, reorderChildrenSchema } from "./navigation.validators.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requiresPermission } from "../middleware/requiresPermission.js";

const router = Router();

router.use(requireAuth);

router.get("/navigation/items", requiresPermission("nav:read"), adminList);
router.post("/navigation/items", requiresPermission("nav:write"), validateBody(createNavSchema), adminCreate);
router.patch("/navigation/items/:id", requiresPermission("nav:write"), validateBody(updateNavSchema), adminUpdate);
router.delete("/navigation/items/:id", requiresPermission("nav:delete"), adminDelete);

// ✅ reorder within same parent
router.post(
  "/navigation/reorder-children",
  requiresPermission("nav:reorder"),
  validateBody(reorderChildrenSchema),
  adminReorderChildren
);

export default router;
