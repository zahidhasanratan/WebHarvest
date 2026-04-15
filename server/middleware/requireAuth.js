const { verifyAccessToken } = require("../lib/authTokens");

function requireAuth(req, _res, next) {
  const header = req.headers.authorization || "";
  const [, token] = header.split(" ");
  if (!token) {
    const err = new Error("Missing Authorization Bearer token");
    err.statusCode = 401;
    return next(err);
  }
  try {
    const payload = verifyAccessToken(token);
    req.auth = { userId: payload.sub };
    return next();
  } catch {
    const err = new Error("Invalid or expired token");
    err.statusCode = 401;
    return next(err);
  }
}

module.exports = { requireAuth };

