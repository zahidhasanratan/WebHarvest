require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");

const { connectDb } = require("./lib/db");
const { authRouter } = require("./routes/auth");
const { meRouter } = require("./routes/me");
const { scrapeRouter } = require("./routes/scrape");

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

app.use("/api/auth", authRouter);
app.use("/api/me", meRouter);
app.use("/api/scrape", scrapeRouter);

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
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
});

const port = Number(process.env.PORT || 5000);

function listen() {
  app.listen(port, () => {
    console.log(`API listening on :${port}`);
  });
}

connectDb()
  .then(listen)
  .catch((e) => {
    console.error("Failed to start server:", e);
    process.exit(1);
  });

