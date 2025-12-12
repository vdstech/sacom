import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth.js'
import {Session} from '../model/session.js'

const router = Router()
try {
    router.get('/', requireAuth, async (req, res) => {
        const sessions = await Session.find({user: req.user._id}).sort({createdAt: -1})
        return res.json({sessions})
    })


    router.delete('/deleteSession', requireAuth, async (req, res) => {
        const result = await Session.deleteOne({_id: req.body.sessionId}
        )
        return res.json({message: 'Logged out from the session', count: result.deletedCount})
    })

    router.delete('/deleteAllSessions', requireAuth, async (req, res) => {
        const result = await Session.deleteMany({user: req.user._id})
        return res.json({message: 'Logged out from all devices', count: result.deletedCount});
    })

    router.delete('/logout', requireAuth, async (req, res) => {
        const deletedSession = await Session.findByIdAndDelete(req.sessionId)
        res.json({
            message: 'Logged out from the current user',
            count: deletedSession ? 1 : 0
        })
    })

} catch (e) {
    next(e)
}


export default router
