import jwt, { decode } from 'jsonwebtoken'
import {Session} from '../model/session.js'
import User from '../model/user.js'

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
            return res.status(401).json({ message: 'Session not found' });
        }
        session.lastSeenAt = new Date()
        await session.save()

        // **IMPORTANT: FULL DEEP POPULATION**
        const user = await User.findById(decoded.sub).populate({
        path: "roles",
        populate: {
            path: "permissions",
            populate: {
            path: "children",   // load level 1 children
            populate: { path: "children" } // recursively populate level 2 children
            }
        }
        });

        if (!user) {
            return res.status(401).json({ error: "Invalid user" });
        }

        req.user = user;
        req.sessionId = decoded.sessionId;
        
        next()
    } catch(e) {
        console.log('Error while checking the authorization information', e)
        res.status(401).json({'Unauthorized': 'Error while authentication the user  '})
    }
}
