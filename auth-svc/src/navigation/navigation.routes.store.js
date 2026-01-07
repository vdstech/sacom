import { Router } from "express";
import { storeGetNavigation } from "./navigation.controller.js";

const router = Router();
router.get("/navigation", storeGetNavigation);
export default router;