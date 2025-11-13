import {Router} from 'express'
import {Role} from '../model/role.js'
import { bootStrapGuard } from '../middleware/bootstrapGuard.js'
import { handleValidation } from '../middleware/handleValidation.js'
import { createRoleValidator } from '../validators/adminValidators.js'

const r = Router()
r.post('/', bootStrapGuard, createRoleValidator, handleValidation, async (req, res) => {
    const {name, permissions} = req.body
    const exists = await Role.findOne({name})
    if (exists) {
        return res.status(409).json({
            error: 'Role already exists'
        })
    }

    const role = Role.create({name, permissions})
    return res.status(201).json(role)
})

r.get('/', bootStrapGuard, async(req, res) =>{
    const roles = await Role.find().sort({name: 1}).lean()
    return res.json(roles)
})

export default r
