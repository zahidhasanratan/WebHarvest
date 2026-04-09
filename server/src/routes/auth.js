const express = require("express");
const bcrypt = require("bcryptjs");
const { z } = require("zod");

const { User } = require("../models/User");
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  getCookieOptions
} = require("../lib/authTokens");

const authRouter = express.Router();

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  name: z.string().max(200).optional()
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200)
});

function normalizeEmail(email) {
  return String(email).trim().toLowerCase();
}

authRouter.post("/register", async (req, res, next) => {
  try {
    const input = RegisterSchema.parse(req.body);
    const email = normalizeEmail(input.email);

    const existing = await User.findOne({ email }).lean();
    if (existing) {
      return res.status(409).json({ error: "Email already in use" });
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await User.create({
      email,
      passwordHash,
      name: input.name || ""
    });

    const accessToken = signAccessToken({ userId: user._id.toString() });
    const refreshToken = signRefreshToken({
      userId: user._id.toString(),
      tokenVersion: 0
    });

    res.cookie("refresh_token", refreshToken, {
      ...getCookieOptions(),
      maxAge: 1000 * 60 * 60 * 24 * 30
    });

    return res.status(201).json({
      accessToken,
      user: { id: user._id, email: user.email, name: user.name }
    });
  } catch (e) {
    if (e?.name === "ZodError") {
      return res.status(400).json({ error: "Invalid input", details: e.errors });
    }
    return next(e);
  }
});

authRouter.post("/login", async (req, res, next) => {
  try {
    const input = LoginSchema.parse(req.body);
    const email = normalizeEmail(input.email);

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const accessToken = signAccessToken({ userId: user._id.toString() });
    const refreshToken = signRefreshToken({
      userId: user._id.toString(),
      tokenVersion: 0
    });

    res.cookie("refresh_token", refreshToken, {
      ...getCookieOptions(),
      maxAge: 1000 * 60 * 60 * 24 * 30
    });

    return res.json({
      accessToken,
      user: { id: user._id, email: user.email, name: user.name }
    });
  } catch (e) {
    if (e?.name === "ZodError") {
      return res.status(400).json({ error: "Invalid input", details: e.errors });
    }
    return next(e);
  }
});

authRouter.post("/refresh", async (req, res, next) => {
  try {
    const token = req.cookies?.refresh_token;
    if (!token) return res.status(401).json({ error: "Missing refresh token" });

    let payload;
    try {
      payload = verifyRefreshToken(token);
    } catch {
      return res.status(401).json({ error: "Invalid refresh token" });
    }

    const user = await User.findById(payload.sub).lean();
    if (!user) return res.status(401).json({ error: "Invalid refresh token" });

    const accessToken = signAccessToken({ userId: String(user._id) });
    const refreshToken = signRefreshToken({
      userId: String(user._id),
      tokenVersion: payload.ver || 0
    });

    res.cookie("refresh_token", refreshToken, {
      ...getCookieOptions(),
      maxAge: 1000 * 60 * 60 * 24 * 30
    });

    return res.json({ accessToken });
  } catch (e) {
    return next(e);
  }
});

authRouter.post("/logout", async (_req, res) => {
  res.clearCookie("refresh_token", { ...getCookieOptions() });
  return res.json({ ok: true });
});

module.exports = { authRouter };

