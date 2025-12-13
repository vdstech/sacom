import mongoose from 'mongoose'

const categorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    slug: {
        type: String,
        required: true
    },
    parent: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
        required: true,
        default: null
    },
    level: Number,
    path: String,
    isActive: {
        type: Boolean,
        default: true
    }
})

export default mongoose.model('Category', categorySchema)