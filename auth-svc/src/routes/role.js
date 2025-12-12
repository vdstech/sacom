import {Router} from 'express'
import Role from '../model/role.js'
import { handleValidation } from '../middleware/handleValidation.js'
import { createRoleValidator } from '../validators/adminValidators.js'
import { requireAuth } from '../middleware/requireAuth.js'
import {requiresPermission} from '../middleware/requiresPermission.js'

const r = Router()
r.post('/', requireAuth, createRoleValidator, requiresPermission('ROLE_WRITE'), handleValidation, async (req, res) => {
    const { name, permissions, description } = req.body

    const exists = await Role.findOne({name})
    if (exists) {
        return res.status(409).json({
            error: 'Role already exists'
        })
    }

    const role = await Role.create({name, permissions, description})
    return res.status(201).json(role)
})

r.get('/', requireAuth, requiresPermission('ROLE_READ'), handleValidation, async(req, res) =>{
    const roles = await Role.find().sort({name: 1}).lean()
    return res.json(roles)
})

r.delete('/', requireAuth, requiresPermission('ROLE_DELETE'), handleValidation, async(req, res) => {
    const {id} = req.body
    const role = await Role.findById(id)
    if (!role) {
         return res.status(409).json({
            error: 'Role does not exists'
        })
    }

    if (role.isSystemRole) {
        return res.status(403).json({
            error: "System roles cannot be deleted"
        });
    }

    const deletedRole = await requestIdleCallback.findByIdAndDelete(id)
    return res.json(deletedRole)
})

export default r
