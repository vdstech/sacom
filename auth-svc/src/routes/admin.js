import {Router} from 'express'
import Role from '../model/role.js'
import User from '../model/user.js'
import {hashPassword, verify} from '../security/password.js'
import {createUserValidation} from '../validators/adminValidators.js'
import {handleValidation} from '../middleware/handleValidation.js'
import { bootStrapGuard } from '../middleware/bootstrapGuard.js'

const r = Router()

r.post('/users', bootStrapGuard, createUserValidation, handleValidation, async (req, res) => {
    const {email, name, role, password} = req.body

    const exists = await User.findOne({email})
    if (exists) {
        return res.status(409).json({error: 'User with this email already exists'})
    }

    const passwordHash = await hashPassword(password)
    const user = await User.create({
        email, name, role, password, passwordHash
        // for future: passwordExpiresAt: new Date(Date.now() + N days)
    })

    return res.status(201).json({
        id : user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt

    })
})

export default r

