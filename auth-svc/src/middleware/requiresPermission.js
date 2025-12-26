import Permission from '../auth/models/permissionModel.js'

function gatherChildren(permission, all = new Set()) {
    all.add(permission.code)

    if (!permission.children || permission.children.length == 0) {
        return all
    }

    for (const child of permission.children) {
        all.add(child.code)

        if (child.children && child.children.length > 0) {
            gatherChildren(child, all)
        }
    }

    return all
}

export default requiresPermission

export function requiresPermission(...permissionCodes) {
    const codes = permissionCodes.flat().filter(Boolean)

    return async (req, res, next) => {
        try {
            const roles = req.user.roles || []
            
            console.log('User roles:', roles)
            if (roles.some(r => r.systemLevel === 'SUPER')) {
                console.log('Bypassing permission checks for SUPER admin')
                return next()
            }

            
            // Admins bypass everything except role/permission management
            const hasAdminAccess = roles.some(r => r.systemLevel === 'ADMIN')
            const adminBypass = hasAdminAccess &&
                codes.every(code =>
                    !code.startsWith('role:') &&
                    !code.startsWith('permission:')
                )

            if (adminBypass) {
                return next()
            }

            if (codes.length === 0) {
                return res.status(403).json({error: "Access Denied"})
            }

            const rolePermissions = await Permission.find({
                _id: {$in: req.user.roles.flatMap(r => r.permissions)}
            }).populate({
                path: "children",
                populate: { path: "children" }
            })

            const effectivePermissions = new Set()
            for (const perm of rolePermissions) {
                gatherChildren(perm, effectivePermissions)
            }

            const missing = codes.filter(code => !effectivePermissions.has(code))
            if (missing.length > 0) {
                return res.status(403).json({error: "Access Denied"})
            }

            next()

        } catch (e) {
            console.error('Error occured while gathering permissions and matching with role, e')
            return res.status(500).json({error: "Internal error"})
        }
    }
}
