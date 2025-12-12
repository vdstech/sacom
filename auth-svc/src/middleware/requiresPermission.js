import Permission from '../model/permission.js'

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

export function requiresPermission(permissionCode) {
    return async (req, res, next) => {
        try {
            console.log('Came to Requires Permission ', req.user.roles)
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

            if (!effectivePermissions.has(permissionCode)) {
                return res.status(403).json({error: "Access Denied"})
            }

            next()

        } catch (e) {
            console.error('Error occured while gathering permissions and matching with role, e')
            return res.status(500).json({error: "Internal error"})
        }
    }
}
