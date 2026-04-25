import { body } from "express-validator";

export const createUserValidation = [
  body("email").isString().withMessage("Email is required").normalizeEmail(),

  body("name")
    .isString()
    .withMessage("Name is required")
    .trim()
    .isLength({ min: 2, max: 80 })
    .withMessage("Name must be within 2-80 characters"),

  body("roles").isArray({ min: 1 }).withMessage("roles must be a non-empty JSON array"),
  body("roles.*").isMongoId().withMessage("each role must be a MongoId string"),

  body("password")
    .isStrongPassword({
      minLength: process.env.PASSWORD_MIN_LENGTH,
      minLowercase: process.env.PASSWORD_MIN_LOWER_CASE,
      minUppercase: process.env.PASSWORD_MIN_UPPER_CASE,
      minNumbers: 1,
      minSymbols: 1,
    })
    .withMessage("Password does not meet password policy"),
];
