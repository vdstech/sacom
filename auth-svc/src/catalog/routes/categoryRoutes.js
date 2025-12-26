import express from 'express'
import {requireAuth} from '../../middleware/requireAuth.js'
import {requiresPermission} from '../../middleware/requiresPermission.js'
import { handleValidation } from '../../middleware/handleValidation.js'
import controller from '../controllers/categoryController.js'

const r = express.Router()

// adding category
r.post('/', requireAuth, requiresPermission('category:write'), handleValidation, controller.create)
r.post('/:id', requireAuth, requiresPermission('category:write'), handleValidation, controller.update)
r.get('/', requireAuth, requiresPermission('category:read'), handleValidation, controller.list)
r.get('/tree', requireAuth, requiresPermission('category:read'), handleValidation, controller.tree)
r.get('/:id', requireAuth, requiresPermission('category:read'), handleValidation, controller.getById)
r.patch('/:id/publish', requireAuth, requiresPermission('category:publish'), handleValidation, controller.publish)
r.patch('/reorder', requireAuth, requiresPermission('category:reorder'), handleValidation, controller.reorder)
r.delete('/:id', requireAuth, requiresPermission('category:delete'), handleValidation, controller.remove) 

export default r
