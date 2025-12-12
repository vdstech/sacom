import {body} from 'express-validator'
import Role from '../model/role.js'

export const createUserValidation = [
    body('email').isString().withMessage('Email is required').normalizeEmail(),

    body('name').isString().withMessage('Name is required').trim()
        .isLength({min: 2, max: 80}).withMessage('Name must be within 2-80 characters'),

    body('roles')
        .isArray({ min: 1 }).withMessage('roles must be a non-empty JSON array'),
    body('roles.*').isMongoId().withMessage('each role must be a MongoId string'),

    body('password').isStrongPassword({
      minLength: process.env.PASSWORD_MIN_LENGTH,
      minLowercase: process.env.PASSWORD_MIN_LOWER_CASE,
      minUppercase: process.env.PASSWORD_MIN_UPPER_CASE,
      minNumbers: 1,
      minSymbols: 1
    }).withMessage('Password does not meet password policy')
]

export const createRoleValidator = [
   body('name').isString().trim().isLength({ min: 2, max: 50 }).withMessage('name 2–50 chars'),
   body('permissions')
    .isArray({ min: 1 }).withMessage('permissions must be a non-empty JSON array'),
   body('permissions.*').isMongoId().withMessage('each permission must be a MongoId string')
]
