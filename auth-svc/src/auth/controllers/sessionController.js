import Session from "../models/sessionModel.js";

export const listSessions = async (req, res) => {
  const sessions = await Session.find({ user: req.user._id }).sort({ createdAt: -1 });
  return res.json({ sessions });
};

export const deleteSession = async (req, res) => {
  const result = await Session.deleteOne({ _id: req.body.sessionId });
  return res.json({ message: "Logged out from the session", count: result.deletedCount });
};

export const deleteAllSessions = async (req, res) => {
  const result = await Session.deleteMany({ user: req.user._id });
  return res.json({ message: "Logged out from all devices", count: result.deletedCount });
};

export const logout = async (req, res) => {
  const deletedSession = await Session.findByIdAndDelete(req.sessionId);
  res.json({
    message: "Logged out from the current user",
    count: deletedSession ? 1 : 0,
  });
};
