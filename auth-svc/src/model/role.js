import mongoose from 'mongoose'

const RoleSchema = new mongoose.Schema({
    name: {type: String, required: true, unique: true, trim: true},
    permissions: {type: [String], default : []}
}, { timestamps: true})

RoleSchema.index({name: 1})

const Role = mongoose.model('Role', RoleSchema)

export default Role
export { Role }
