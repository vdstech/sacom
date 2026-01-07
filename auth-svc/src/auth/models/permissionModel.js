import mongoose from 'mongoose'

const permissionSchema = mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    description: {
        type: String,
        required: true,
        trim: true
    },
    children: [{
        type: mongoose.Types.ObjectId,
        ref: "Permission"
    }]
}, { timestamps: true, collection: "backend_permissions"})

export default mongoose.model('Permission', permissionSchema)
