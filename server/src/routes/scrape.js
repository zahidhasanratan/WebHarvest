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
    .max(4)
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
        extract: body.extract
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
