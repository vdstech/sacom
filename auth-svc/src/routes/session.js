import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth.js'
import {Session} from '../model/session.js'

const router = Router()
try {
    router.get('/', async (req, res) => {
        const sessions = await Session.find({user: req.body.userId}).sort({createdAt: -1})
        return res.json({sessions})
    })


    router.delete('/deleteSession', async (req, res) => {
        const result = await Session.deleteOne(
            {user: req.body.userId, _id: req.body.sessionId}
        )
        return res.json({message: 'Logged out from the session', count: result.deletedCount})
    })

    router.delete('/deleteAllSessions', async (req, res) => {
        const result = await Session.deleteMany({user: req.body.userId})
        return res.json({message: 'Logged out from all devices', count: result.deletedCount});
    })

    router.delete('/logout', requireAuth, async (req, res) => {
        const deletedSession = await Session.findByIdAndDelete(req.user.sessionId)
        res.json({
            message: 'Logged out from the current user',
            count: deletedSession ? 1 : 0
        })
    })

} catch (e) {
    next(e)
}


export default router
