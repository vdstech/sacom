export const getMe = async (req, res) => {
  const user = req.user;
  res.json({
    id: user._id,
    email: user.email,
    role: user.role ? user.role.name : null,
    permissions:
      user.role && Array.isArray(user.role.permissions)
        ? user.role.permissions.map((p) => p.code)
        : [],
  });
};
