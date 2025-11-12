import {validationResult} from 'express-validator'

export function handleValidation(req, res, next) {
    const result = validationResult(req)
    if (result.isEmpty())
        return next()

    const errors = result.errors().map((e) => ({
        field: e.type === 'field' ? e.path : e.type,
        msg: e.msg
    }))
    return res.status(400).json(errors)
}