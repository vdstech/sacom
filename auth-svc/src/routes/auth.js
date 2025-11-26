import jwt from 'jsonwebtoken'
import express from 'express'

import User from '../model/user.js'
import { verify } from '../security/password.js'
import {Session} from '../model/session.js'


const authRouter = express.Router()
authRouter.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body
        if (!email || !password) {
            return res.status(400).json({ error: 'email and password are required' })
        }

        const user = await User.findOne({ email }).populate('role')
        if (!user) {
            console.warn('Email is incorrect')
            return res.status(401).json({ error: 'email / password is incorrect' })
        }

        const passwordMatch = await verify(password, user.passwordHash)
        if (!passwordMatch) {
            console.warn('Password is incorrect')
            return res.status(401).json({ error: 'email / password is incorrect' })
        }

        // insert in to session model.
        const session = await Session.create({
            user: user._id,
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
            lastSeenAt: new Date()
        })

        // prepare the payload
        const payload = {
            sub: user._id.toString(),
            role: user.role,
            sessionId: session._id.toString()
        }

        const accessToken = jwt.sign(
            payload, process.env.ACCESS_TOKEN_SECRET, {expiresIn: process.env.ACCESS_TOKEN_TTL}
        )

        return res.json({
            user: {
                id: user._id,
                email: user.email,
                role: user.role
            },
            accessToken,
        })
    } catch (e) {
        console.error('login failed', e)
        return res.status(500).json({ error: 'Something went wrong. Try again later.' })
    }
})

export default authRouter
