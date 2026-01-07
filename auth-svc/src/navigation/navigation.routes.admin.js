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

const router = Router();

// router.use(authMiddleware);
// router.use(requirePermission("NAV_WRITE"));

router.get("/navigation/items", adminList);
router.post("/navigation/items", validateBody(createNavSchema), adminCreate);
router.patch("/navigation/items/:id", validateBody(updateNavSchema), adminUpdate);
router.delete("/navigation/items/:id", adminDelete);

// ✅ reorder within same parent
router.post("/navigation/reorder-children", validateBody(reorderChildrenSchema), adminReorderChildren);

export default router;