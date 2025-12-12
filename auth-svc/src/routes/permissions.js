import {Router} from 'express'
import {requireAuth} from '../middleware/requireAuth.js'
import {requiresPermission} from '../middleware/requiresPermission.js'
import Permission from '../model/permission.js'

const r = Router()

r.post('/', requireAuth, requiresPermission('PERMISSION_CREATE'), async (req, res) => {
    try {
        const permisson = await Permission.create(req.body)
        res.status(201).json({permisson})
    } catch (e) {
        res.status(400).json({ error: e.message })
    }
})

r.get('/', requireAuth, requiresPermission('PERMISSION_READ'), async (req, res) => {
    try {
        const permissions = await Permission.find()
        res.status(200).json({permissions})
    } catch (e) {
        res.status(400).json({ error: e.message })
    }
})

r.put('/', requireAuth, requiresPermission('PERMISSION_CREATE'), async (req, res) => {
    try {
        const permissions = await Permission.find()
        res.status(200).json({permissions})
    } catch (e) {
        res.status(400).json({ error: e.message })
    }
})

r.delete('/:id', requireAuth, requiresPermission('PERMISSION_WRITE'), async (req, res) => {
    try {
        const permission = await Permission.findByIdAndDelete(req.params.id)
        res.status(200).json({permission})
    } catch(e) {
        res.status(400).json({ error: e.message })
    }
})

export default r