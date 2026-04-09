const mongoose = require("mongoose");

async function connectDb() {
  if (process.env.SKIP_DB === "1") {
    console.warn(
      "SKIP_DB=1: MongoDB disabled (scraping works; /api/auth and /api/me need a database)."
    );
    return;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    const err = new Error(
      "MONGODB_URI is not set. Add it to .env or set SKIP_DB=1 to run without MongoDB."
    );
    err.statusCode = 500;
    throw err;
  }

  await mongoose.connect(uri, {
    autoIndex: process.env.NODE_ENV === "development"
  });
}

module.exports = { connectDb };

