const express = require("express");
const { z } = require("zod");

const { requireAuth } = require("../middleware/requireAuth");
const { requireDb } = require("../middleware/requireDb");
const { Run } = require("../models/Run");
const { Job } = require("../models/Job");
const { runScrape } = require("../lib/scrapeEngine");

const runsRouter = express.Router();

const RunJobSchema = z.object({
  jobId: z.string().min(1)
});

runsRouter.use(requireAuth, requireDb);

runsRouter.get("/", async (req, res, next) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
    const runs = await Run.find({ userId: req.auth.userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return res.json({ runs });
  } catch (e) {
    return next(e);
  }
});

runsRouter.get("/:id", async (req, res, next) => {
  try {
    const run = await Run.findOne({ _id: req.params.id, userId: req.auth.userId }).lean();
    if (!run) return res.status(404).json({ error: "Run not found" });
    return res.json({ run });
  } catch (e) {
    return next(e);
  }
});

runsRouter.post("/run-job", async (req, res, next) => {
  const startedAt = new Date();
  try {
    const input = RunJobSchema.parse(req.body);
    const job = await Job.findOne({ _id: input.jobId, userId: req.auth.userId }).lean();
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (!job.isActive) return res.status(400).json({ error: "Job is not active" });

    const request = {
      url: job.startUrl,
      depth: job.depth,
      extract: job.extract,
      options: job.options || {},
      features: job.features || {}
    };

    const scraped = await runScrape(request);
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();

    const run = await Run.create({
      userId: req.auth.userId,
      jobId: job._id,
      status: "success",
      startedAt,
      finishedAt,
      durationMs,
      request,
      result: scraped
    });

    return res.status(201).json({ runId: run._id });
  } catch (e) {
    if (e?.name === "ZodError") {
      return res.status(400).json({ error: "Invalid input", details: e.errors });
    }
    return next(e);
  }
});

module.exports = { runsRouter };

