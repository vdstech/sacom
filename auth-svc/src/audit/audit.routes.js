import { Router } from "express";
import { getAuditLogs } from "./audit.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requiresPermission } from "../middleware/requiresPermission.js";

const router = Router();

router.get("/", requireAuth, requiresPermission("audit:read"), getAuditLogs);

export default router;
