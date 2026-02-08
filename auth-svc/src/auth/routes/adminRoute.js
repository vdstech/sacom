import { Router } from "express";
import { createUserValidation } from "../validators/adminValidators.js";
import { handleValidation } from "../../middleware/handleValidation.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requiresPermission } from "../../middleware/requiresPermission.js";
import * as controller from "../controllers/adminController.js";

const r = Router();

r.post(
  "/",
  requireAuth,
  requiresPermission("user:write"),
  createUserValidation,
  handleValidation,
  controller.createUser
);

r.get("/", requireAuth, requiresPermission("user:read"), handleValidation, controller.listUsers);
r.get("/:id", requireAuth, requiresPermission("user:read"), handleValidation, controller.getUserById);
r.put("/:id", requireAuth, requiresPermission("user:write"), handleValidation, controller.updateUser);

r.delete(
  "/:id",
  requireAuth,
  requiresPermission("user:delete"),
  handleValidation,
  controller.deleteUser
);

export default r;
