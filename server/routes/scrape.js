const express = require("express");
const { z } = require("zod");
const { runScrape } = require("../lib/scrapeEngine");

const scrapeRouter = express.Router();

const BodySchema = z.object({
  url: z.string().min(1).max(4000),
  depth: z.coerce.number().int().min(0).max(4).optional().default(0),
  extract: z
    .array(z.enum(["text", "links", "images", "meta"]))
    .min(1)
    .max(4),
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
    .default({})
});

scrapeRouter.post("/", async (req, res, next) => {
  try {
    const body = BodySchema.parse(req.body);
    const result = await runScrape(body);
    return res.json({
      status: "ok",
      request: {
        url: body.url,
        depth: body.depth,
        extract: body.extract,
        options: body.options,
        features: body.features
      },
      ...result
    });
  } catch (e) {
    if (e?.name === "ZodError") {
      return res.status(400).json({
        error: "Invalid request",
        details: e.errors
      });
    }
    if (e.statusCode) {
      return res.status(e.statusCode).json({ error: e.message });
    }
    return next(e);
  }
});

module.exports = { scrapeRouter };
