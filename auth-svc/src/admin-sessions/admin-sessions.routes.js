import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import * as controller from "./admin-sessions.controller.js";

const router = Router();

router.get("/", requireAuth, controller.listSessions);

router.delete("/deleteSession", requireAuth, controller.deleteSession);

router.delete("/deleteAllSessions", requireAuth, controller.deleteAllSessions);

router.delete("/logout", requireAuth, controller.logout);

export default router;
