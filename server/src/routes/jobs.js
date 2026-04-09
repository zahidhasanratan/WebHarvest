const express = require("express");
const { z } = require("zod");

const { requireAuth } = require("../middleware/requireAuth");
const { requireDb } = require("../middleware/requireDb");
const { Job } = require("../models/Job");

const jobsRouter = express.Router();

const JobCreateSchema = z.object({
  name: z.string().min(1).max(160),
  startUrl: z.string().min(1).max(4000),
  depth: z.coerce.number().int().min(0).max(4).optional().default(0),
  extract: z.array(z.enum(["text", "links", "images", "meta"])).min(1).max(4),
  options: z
    .object({
      maxPages: z.coerce.number().int().min(1).max(50).optional(),
      includeSubdomains: z.coerce.boolean().optional().default(false),
      allowQueryParams: z.coerce.boolean().optional().default(false),
      includeUrlContains: z.string().max(500).optional(),
      excludeUrlContains: z.string().max(500).optional(),
      crawlDelayMs: z.coerce.number().int().min(0).max(5000).optional(),
      timeoutMs: z.coerce.number().int().min(2000).max(60000).optional(),
      retries: z.coerce.number().int().min(0).max(3).optional(),
      userAgent: z.string().max(260).optional()
    })
    .optional()
    .default({}),
  features: z
    .object({
      emails: z.coerce.boolean().optional().default(false),
      phones: z.coerce.boolean().optional().default(false),
      prices: z.coerce.boolean().optional().default(false),
      videos: z.coerce.boolean().optional().default(false),
      audio: z.coerce.boolean().optional().default(false),
      backgroundImages: z.coerce.boolean().optional().default(false),
      documents: z.coerce.boolean().optional().default(false)
    })
    .optional()
    .default({}),
  isActive: z.boolean().optional().default(true)
});

const JobUpdateSchema = JobCreateSchema.partial().extend({
  name: z.string().min(1).max(160).optional()
});

jobsRouter.use(requireAuth, requireDb);

jobsRouter.get("/", async (req, res, next) => {
  try {
    const jobs = await Job.find({ userId: req.auth.userId })
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ jobs });
  } catch (e) {
    return next(e);
  }
});

jobsRouter.post("/", async (req, res, next) => {
  try {
    const input = JobCreateSchema.parse(req.body);
    const job = await Job.create({
      userId: req.auth.userId,
      ...input
    });
    return res.status(201).json({ job });
  } catch (e) {
    if (e?.name === "ZodError") {
      return res.status(400).json({ error: "Invalid input", details: e.errors });
    }
    return next(e);
  }
});

jobsRouter.get("/:id", async (req, res, next) => {
  try {
    const job = await Job.findOne({ _id: req.params.id, userId: req.auth.userId }).lean();
    if (!job) return res.status(404).json({ error: "Job not found" });
    return res.json({ job });
  } catch (e) {
    return next(e);
  }
});

jobsRouter.patch("/:id", async (req, res, next) => {
  try {
    const input = JobUpdateSchema.parse(req.body);
    const job = await Job.findOneAndUpdate(
      { _id: req.params.id, userId: req.auth.userId },
      { $set: input },
      { new: true }
    ).lean();
    if (!job) return res.status(404).json({ error: "Job not found" });
    return res.json({ job });
  } catch (e) {
    if (e?.name === "ZodError") {
      return res.status(400).json({ error: "Invalid input", details: e.errors });
    }
    return next(e);
  }
});

jobsRouter.delete("/:id", async (req, res, next) => {
  try {
    const r = await Job.deleteOne({ _id: req.params.id, userId: req.auth.userId });
    if (!r.deletedCount) return res.status(404).json({ error: "Job not found" });
    return res.json({ ok: true });
  } catch (e) {
    return next(e);
  }
});

module.exports = { jobsRouter };

