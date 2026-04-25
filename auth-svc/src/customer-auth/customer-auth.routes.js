import express from "express";
import * as controller from "./customer-auth.controller.js";

const router = express.Router();

router.post("/signup", controller.signup);
router.post("/login", controller.login);
router.post("/refresh", controller.refresh);
router.post("/logout", controller.logout);

export default router;
