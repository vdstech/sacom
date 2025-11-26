export function requiresPermission(permissionCode) {
    return ((req, res, next) => {
        const user = req.user
        if (!user || !user.role || !Array.isArray(user.role.permissions)) {
            res.status(401).json({'UnAuthorized' : 'User does not have sufficient roles or permissions'})
        }

        const hasPermisison = user.role.permissions.some((p) => {
            p.code == permissionCode
        })

        if (!hasPermisison) {
            res.status(401).json({'UnAuthorized' : 'User does not have permissions'})
        }
        
        next()
    })
}