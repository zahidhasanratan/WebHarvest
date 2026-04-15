const jwt = require("jsonwebtoken");

function getJwtConfig() {
  const accessSecret = process.env.JWT_ACCESS_SECRET;
  const refreshSecret = process.env.JWT_REFRESH_SECRET;
  if (!accessSecret || !refreshSecret) {
    const err = new Error("JWT secrets are not set");
    err.statusCode = 500;
    throw err;
  }
  return {
    accessSecret,
    refreshSecret,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "30d"
  };
}

function signAccessToken({ userId }) {
  const cfg = getJwtConfig();
  return jwt.sign({ sub: userId, typ: "access" }, cfg.accessSecret, {
    expiresIn: cfg.accessExpiresIn
  });
}

function signRefreshToken({ userId, tokenVersion }) {
  const cfg = getJwtConfig();
  return jwt.sign(
    { sub: userId, typ: "refresh", ver: tokenVersion },
    cfg.refreshSecret,
    { expiresIn: cfg.refreshExpiresIn }
  );
}

function verifyAccessToken(token) {
  const cfg = getJwtConfig();
  return jwt.verify(token, cfg.accessSecret);
}

function verifyRefreshToken(token) {
  const cfg = getJwtConfig();
  return jwt.verify(token, cfg.refreshSecret);
}

function getCookieOptions() {
  const secure = String(process.env.COOKIE_SECURE || "false") === "true";
  return {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/"
  };
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  getCookieOptions
};

