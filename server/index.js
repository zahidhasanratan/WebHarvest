require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");

const { connectDb } = require("./lib/db");
const { authRouter } = require("./routes/auth");
const { meRouter } = require("./routes/me");
const { scrapeRouter } = require("./routes/scrape");
const { jobsRouter } = require("./routes/jobs");
const { runsRouter } = require("./routes/runs");
const { exportsRouter } = require("./routes/exports");

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(",").map((s) => s.trim()) || true,
    credentials: true
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/scrape", scrapeRouter);

// eslint-disable-next-line no-unused-vars
function errorHandler(err, _req, res, _next) {
  const status = err.statusCode || 500;
  if (process.env.NODE_ENV === "development") {
    console.error(err);
  }
  const dev = process.env.NODE_ENV === "development";
  res.status(status).json({
    error:
      status === 500 && !dev
        ? "Internal Server Error"
        : err.message || "Internal Server Error",
    details: dev ? err.details : undefined,
    stack: dev && status === 500 ? err.stack : undefined
  });
}

const preferredPort = Number(process.env.PORT || 5000);
const isProd = process.env.NODE_ENV === "production";
const maxDevPortTries = 10;

function listen(tryPort = preferredPort, attemptsLeft = maxDevPortTries) {
  const server = app.listen(tryPort, () => {
    if (tryPort !== preferredPort) {
      console.warn(
        `(Using port ${tryPort} because ${preferredPort} was busy — free that port, set PORT in .env, or point the Vite proxy at ${tryPort}.)`
      );
    }
    console.log(`API listening on :${tryPort}`);
  });
  server.on("error", (err) => {
    if (err?.code === "EADDRINUSE") {
      if (!isProd && attemptsLeft > 1) {
        const next = tryPort + 1;
        console.warn(`Port ${tryPort} is in use, trying ${next}…`);
        listen(next, attemptsLeft - 1);
        return;
      }
      console.error(
        `Port ${tryPort} is already in use. Stop the other server (e.g. another \`node\` or \`nodemon\`) or set PORT in .env.`
      );
      process.exit(1);
    }
    console.error("Server error:", err);
    process.exit(1);
  });
}

connectDb()
  .then(() => {
    if (mongoose.connection.readyState === 1) {
      app.use("/api/auth", authRouter);
      app.use("/api/me", meRouter);
      app.use("/api/jobs", jobsRouter);
      app.use("/api/runs", runsRouter);
      app.use("/api/export", exportsRouter);
    }
    app.use(errorHandler);
    listen();
  })
  .catch((e) => {
    console.error("Failed to start server:", e);
    process.exit(1);
  });

