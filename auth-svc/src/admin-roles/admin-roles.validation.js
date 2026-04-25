import { body } from "express-validator";

export const createRoleValidator = [
  body("name").isString().trim().isLength({ min: 2, max: 50 }).withMessage("name 2–50 chars"),
  body("permissions").isArray({ min: 1 }).withMessage("permissions must be a non-empty JSON array"),
  body("permissions.*").isMongoId().withMessage("each permission must be a MongoId string"),
];
