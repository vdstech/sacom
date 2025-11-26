import jwt, { decode } from 'jsonwebtoken'
import {Session} from '../model/session.js'

export async function requireAuth(req, res, next) {
    try {
        // 1. Get token from authorization header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({message: 'Unauthorized: No token provided'})
        }

        // 2. Get the token
        const token = authHeader.split(' ')[1]

        // 3. Get the decoded JWT
        const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET)
        
        // 4. Retrieve the session Id
        const session = await Session.findById(decoded.sessionId)
        if (!session) {
            return res.status(401).json({ message: 'Session revoked or not found' });
        }

        session.lastSeenAt = new Date()
        await session.save()
        
        req.user = {
            id: decoded.sub,
            role: decoded.role,
            sessionId: decoded.sessionId
        }
        next()
    } catch(e) {
        console.log('Error while checking the authorization information', e)
        res.status(401).json({'Unauthorized': 'Error while authentication the user  '})
    }
}
