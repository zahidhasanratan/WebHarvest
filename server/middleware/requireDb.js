const mongoose = require("mongoose");

function requireDb(_req, _res, next) {
  if (process.env.SKIP_DB === "1") {
    const err = new Error("Database is disabled (SKIP_DB=1). Enable MongoDB to use this feature.");
    err.statusCode = 503;
    return next(err);
  }
  if (mongoose.connection.readyState !== 1) {
    const err = new Error("Database is not connected yet.");
    err.statusCode = 503;
    return next(err);
  }
  return next();
}

module.exports = { requireDb };

