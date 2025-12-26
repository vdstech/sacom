import mongoose, { mongo } from 'mongoose'

const RoleSchema = new mongoose.Schema({
    name: {
        type: String, 
        required: true, 
        unique: true, 
        trim: true
    },
    description: {
        type: String,
        default: ''
    },
    permissions: [{
       type: mongoose.Schema.Types.ObjectId,
       ref: 'Permission',
       required: true
    }],
    isSystemRole:{
        type: Boolean,
        default: false
    },
    systemLevel: {
        type: String,
        enum: ["NONE", "ADMIN", "SUPER"],
        default: "NONE"
  }
}, { timestamps: true})

RoleSchema.index({name: 1})

const Role = mongoose.model('Role', RoleSchema)

export default Role
