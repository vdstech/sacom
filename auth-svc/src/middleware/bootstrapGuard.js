export function bootStrapGuard(req, res, next) {
    const expected = process.env.BOOTSTRAP_ADMIN_SECRET || ''
    const got = req.headers['x-bootstrap-admin']
    if (!expected || got != expected) {
        return res.status(401).json({error: 'Unauthorized (bootstrap)'})
    }
    return next()
}