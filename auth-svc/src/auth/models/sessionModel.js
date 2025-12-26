import mongoose from 'mongoose'

const sessionSchema = mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    ipAddress: String,
    userAgent: String,
    deviceName: String,
    lastSeenAt: Date
    
}, {
    timestamps: true
})

export const Session = mongoose.model('Session', sessionSchema)
