import mongoose from 'mongoose'

const permissionSchema = mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        required: true
    },
    description: {
        type: String,
        required: true,
        trim: true,
        required: true
    }
})

export default mongoose.model('Permission', permissionSchema)