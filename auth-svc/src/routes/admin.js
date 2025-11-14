import {Router} from 'express'
import Role from '../model/role.js'
import User from '../model/user.js'
import {hashPassword, verify} from '../security/password.js'
import {createUserValidation} from '../validators/adminValidators.js'
import {handleValidation} from '../middleware/handleValidation.js'
import { bootStrapGuard } from '../middleware/bootstrapGuard.js'

const r = Router()

r.post('/', bootStrapGuard, createUserValidation, handleValidation, async (req, res) => {
    const {email, name, roleName, password} = req.body

    console.log("email = ", email)
    console.log("name = ", name)
    console.log("roleName = ", roleName)
    console.log("password = ", password)
    const exists = await User.findOne({email})
    if (exists) {
        return res.status(409).json({error: 'User with this email already exists'})
    }

     const role = await Role.findOne({ name: roleName });
    // validator already checked existence; just being safe:
    if (!role) return res.status(400).json({ error: 'invalid role' });

    const passwordHash = await hashPassword(password)
    const user = await User.create({
        email,
        name,
        role: role._id,
        passwordHash
        // for future: passwordExpiresAt: new Date(Date.now() + N days)
    })

    return res.status(201).json({
        id : user.id,
        email: user.email,
        name: user.name,
        role: role.name,
        createdAt: user.createdAt

    })
})

r.get('/', bootStrapGuard, async (req, res) => {
    const users = await User.find().sort({name: 1}).lean()
    return res.json(users)
})

r.delete('/', bootStrapGuard, async (req, res) => {
    const user = await User.findByIdAndDelete(req.body.id)
    if (!user) {
        res.status(409).json({"status" : "User did not exist"})
    }

    return res.json(user)
})

export default r
