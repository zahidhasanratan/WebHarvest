const express = require("express");

const { requireAuth } = require("../middleware/requireAuth");
const { requireDb } = require("../middleware/requireDb");
const { Run } = require("../models/Run");

const exportsRouter = express.Router();

exportsRouter.use(requireAuth, requireDb);

function csvEscape(v) {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

exportsRouter.get("/runs/:id.json", async (req, res, next) => {
  try {
    const run = await Run.findOne({ _id: req.params.id, userId: req.auth.userId }).lean();
    if (!run) return res.status(404).json({ error: "Run not found" });
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="run-${run._id}.json"`);
    return res.send(JSON.stringify(run, null, 2));
  } catch (e) {
    return next(e);
  }
});

exportsRouter.get("/runs/:id.links.csv", async (req, res, next) => {
  try {
    const run = await Run.findOne({ _id: req.params.id, userId: req.auth.userId }).lean();
    if (!run) return res.status(404).json({ error: "Run not found" });

    const pages = Array.isArray(run.result?.pages) ? run.result.pages : [];
    const rows = [["page_url", "link_url"]];
    for (const p of pages) {
      if (p?.error) continue;
      const links = Array.isArray(p?.data?.links) ? p.data.links : [];
      for (const l of links) rows.push([p.url || "", l]);
    }

    const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="run-${run._id}-links.csv"`);
    return res.send(csv);
  } catch (e) {
    return next(e);
  }
});

exportsRouter.get("/runs/:id.images.csv", async (req, res, next) => {
  try {
    const run = await Run.findOne({ _id: req.params.id, userId: req.auth.userId }).lean();
    if (!run) return res.status(404).json({ error: "Run not found" });

    const pages = Array.isArray(run.result?.pages) ? run.result.pages : [];
    const rows = [["page_url", "image_url"]];
    for (const p of pages) {
      if (p?.error) continue;
      const images = Array.isArray(p?.data?.images) ? p.data.images : [];
      for (const src of images) rows.push([p.url || "", src]);
    }

    const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="run-${run._id}-images.csv"`);
    return res.send(csv);
  } catch (e) {
    return next(e);
  }
});

module.exports = { exportsRouter };

