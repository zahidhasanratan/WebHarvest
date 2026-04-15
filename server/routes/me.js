const express = require("express");
const { User } = require("../models/User");
const { requireAuth } = require("../middleware/requireAuth");

const meRouter = express.Router();

meRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.auth.userId).lean();
    if (!user) return res.status(404).json({ error: "User not found" });
    return res.json({ id: user._id, email: user.email, name: user.name });
  } catch (e) {
    return next(e);
  }
});

module.exports = { meRouter };

