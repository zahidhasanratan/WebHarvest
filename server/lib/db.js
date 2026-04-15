const mongoose = require("mongoose");

async function connectDb() {
  const skip =
    process.env.SKIP_DB === "1" || !String(process.env.MONGODB_URI || "").trim();

  if (skip) {
    if (process.env.SKIP_DB === "1") {
      console.warn("SKIP_DB=1: MongoDB disabled.");
    } else {
      console.warn(
        "MONGODB_URI not set: running without MongoDB (scraping only). Set MONGODB_URI to enable auth, jobs, and runs."
      );
    }
    return;
  }

  const uri = process.env.MONGODB_URI;

  const selectionMs = Number(process.env.MONGODB_SERVER_SELECTION_MS || 5000);

  try {
    await mongoose.connect(uri, {
      autoIndex: process.env.NODE_ENV === "development",
      serverSelectionTimeoutMS: Number.isFinite(selectionMs) ? selectionMs : 5000
    });
  } catch (err) {
    console.warn(
      "Could not connect to MongoDB:",
      err?.message || err,
      "— running without database (scraping only). Fix MONGODB_URI or start MongoDB to enable auth and jobs."
    );
    try {
      await mongoose.disconnect();
    } catch {
      /* ignore */
    }
  }
}

module.exports = { connectDb };

