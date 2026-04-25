import express from "express";
import { requireCustomerAuth } from "../middleware/requireCustomerAuth.js";
import * as controller from "./customer-profile.controller.js";

const router = express.Router();

router.get("/", requireCustomerAuth, controller.getCustomerMe);

export default router;
