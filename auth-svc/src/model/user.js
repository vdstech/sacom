import mongoose from "mongoose"

const UserSchema = new mongoose.Schema({
    email: {type: String, required: true, unique: true, lowercase: true, trim: true},
    name: {type: String, required: true, trim: true},
    passwordHash: {type: String, required: true},

    roles: [{type: mongoose.Schema.Types.ObjectId, ref: 'Role', required: true}],   

    disabled: {type: Boolean, default: true},
    force_reset: {type: Boolean, default: false},

    passwordExpiresAt: {type: Date},
    lastLogin: {type: Date},
    isSystemUser: {type: Boolean, default: false}
}, 
{
    timestamps: true
})

UserSchema.index({email: 1})

export default mongoose.model('User', UserSchema)