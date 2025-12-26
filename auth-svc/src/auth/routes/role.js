import { Router } from "express";
import { handleValidation } from "../../middleware/handleValidation.js";
import { createRoleValidator } from "../validators/adminValidators.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requiresPermission } from "../../middleware/requiresPermission.js";
import * as controller from "../controllers/roleController.js";

const r = Router();
r.post(
  "/",
  requireAuth,
  createRoleValidator,
  requiresPermission(["role:create", "role:read"]),
  handleValidation,
  controller.createRole
);

r.get("/", requireAuth, requiresPermission("role:read"), handleValidation, controller.listRoles);

r.delete("/", requireAuth, requiresPermission("role:delete"), handleValidation, controller.deleteRole);

export default r;
