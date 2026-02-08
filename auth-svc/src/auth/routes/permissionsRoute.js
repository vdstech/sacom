import { Router } from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requiresPermission } from "../../middleware/requiresPermission.js";
import { handleValidation } from "../../middleware/handleValidation.js";
import * as controller from "../controllers/permissionsController.js";

const r = Router();

r.post(
  "/",
  requireAuth,
  requiresPermission("permission:create"),
  handleValidation,
  controller.createPermission
);

r.get("/", requireAuth, requiresPermission("permission:read"), controller.listPermissions);

r.put("/", requireAuth, requiresPermission("permission:update"), controller.updatePermissions);

r.delete(
  "/:id",
  requireAuth,
  requiresPermission("permission:delete"),
  controller.deletePermission
);

export default r;
