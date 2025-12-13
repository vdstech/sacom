import express from 'express'
import {requireAuth} from '../../middleware/requireAuth.js'
import {requiresPermission} from '../../middleware/requiresPermission.js'
import { handleValidation } from '../../middleware/handleValidation.js'
import Category from '../model/category.js'

const r = express.Router()

// adding category
r.post('/', requireAuth, requiresPermission(''), handleValidation, async (req, res) => {
    const {name, slug, parent} = req.body
    const category = await Category.create(name, slug, parent)
    return res.json({category})
})