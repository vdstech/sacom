import express from "express";
import * as controller from "../controllers/authController.js";

const authRouter = express.Router();
authRouter.post("/login", controller.login);

export default authRouter;
