import express from "express";
import * as controller from "../controllers/authController.js";

const authRouter = express.Router();
authRouter.post("/login", controller.login);
authRouter.post("/refresh", controller.refresh);
authRouter.post("/logout", controller.logout);

export default authRouter;
