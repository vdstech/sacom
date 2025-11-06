import mongoose from "mongoose"

const UserSchema = new mongoose.Schema({
    email: {type: String, required: true, unique: true, lowercase: true, trim: true},
    name: {type: String, required: true, trim: true},
    role: {type: String, required: true, trim: true, default: 'SUPER_ADMIN'},
    passwordHash: {type: String, required: true},

    disabled: {type: Boolean, default: true},
    force_reset: {type: Boolean, default: false},

    passwordExpiresAt: {type: Date},
    lastLogin: {type: Date}
}, 
{
    timestamps: true
})

UserSchema.index({email: 1})

export default mongoose.model('User', UserSchema)