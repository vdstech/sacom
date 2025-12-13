import {Router} from 'express'
import {requireAuth} from '../../middleware/requireAuth.js'
import {requiresPermission} from '../../middleware/requiresPermission.js'
import Permission from '../model/permission.js'

const r = Router()

r.post('/', requireAuth, requiresPermission('permission:create'), async (req, res) => {
    try {
        const permisson = await Permission.create(req.body)

        // 2️⃣ Attach permission to ADMIN role
        const adminRole = await Role.findOne({ name: 'ADMIN' });

        if (!adminRole) {
            // Fail loudly – this should never happen
            return res.status(500).json({
                error: 'ADMIN role not found. Permission created but not assigned.'
            });
        }

        await Role.updateOne(
            { _id: adminRole._id },
            { $addToSet: { permissions: permission._id } }
        );
        res.status(201).json({permisson})
    } catch (e) {
        res.status(400).json({ error: e.message })
    }
})

r.get('/', requireAuth, requiresPermission('permission:read'), async (req, res) => {
    try {
        const permissions = await Permission.find()
        res.status(200).json({permissions})
    } catch (e) {
        res.status(400).json({ error: e.message })
    }
})

r.put('/', requireAuth, requiresPermission('permission:create'), async (req, res) => {
    try {
        const permissions = await Permission.find()
        res.status(200).json({permissions})
    } catch (e) {
        res.status(400).json({ error: e.message })
    }
})

r.delete('/:id', requireAuth, requiresPermission('permission:delete'), async (req, res) => {
    try {
        const permission = await Permission.findByIdAndDelete(req.params.id)
        res.status(200).json({permission})
    } catch(e) {
        res.status(400).json({ error: e.message })
    }
})

export default r