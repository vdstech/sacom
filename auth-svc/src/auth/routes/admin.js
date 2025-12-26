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

r.delete(
  "/",
  requireAuth,
  requiresPermission("user:delete"),
  handleValidation,
  controller.deleteUser
);

export default r;
