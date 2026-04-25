import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import * as controller from "./admin-auth.me.controller.js";

const router = express.Router();

router.get("/me", requireAuth, controller.getMe);

export default router;
