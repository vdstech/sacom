import { body } from "express-validator";
import { ADMIN_MENU_IDS } from "./admin-menu-catalog.js";

export const createRoleValidator = [
  body("name").isString().trim().isLength({ min: 2, max: 50 }).withMessage("name 2–50 chars"),
  body("permissions").isArray({ min: 1 }).withMessage("permissions must be a non-empty JSON array"),
  body("permissions.*").isMongoId().withMessage("each permission must be a MongoId string"),
  body("visibleMenusConfigured").optional().isBoolean().withMessage("visibleMenusConfigured must be a boolean"),
  body("visibleMenus").optional().isArray().withMessage("visibleMenus must be an array"),
  body("visibleMenus.*").optional().isIn(ADMIN_MENU_IDS).withMessage("visibleMenus contains an invalid menu id"),
];

export const updateRoleValidator = [
  body("name").optional().isString().trim().isLength({ min: 2, max: 50 }).withMessage("name 2–50 chars"),
  body("description").optional().isString().withMessage("description must be a string"),
  body("permissions").optional().isArray({ min: 1 }).withMessage("permissions must be a non-empty JSON array"),
  body("permissions.*").optional().isMongoId().withMessage("each permission must be a MongoId string"),
  body("visibleMenusConfigured").optional().isBoolean().withMessage("visibleMenusConfigured must be a boolean"),
  body("visibleMenus").optional().isArray().withMessage("visibleMenus must be an array"),
  body("visibleMenus.*").optional().isIn(ADMIN_MENU_IDS).withMessage("visibleMenus contains an invalid menu id"),
];
