const mongoose = require("mongoose");

const RunSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true, ref: "User" },
    jobId: { type: mongoose.Schema.Types.ObjectId, required: false, index: true, ref: "Job" },
    status: { type: String, enum: ["success", "error"], required: true },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date, required: true },
    durationMs: { type: Number, required: true },
    request: {
      url: { type: String, required: true },
      depth: { type: Number, required: true },
      extract: { type: [String], required: true },
      options: { type: Object, required: false },
      features: { type: Object, required: false }
    },
    result: {
      startUrl: { type: String, required: false },
      maxDepth: { type: Number, required: false },
      extract: { type: [String], required: false },
      pageCount: { type: Number, required: false },
      pages: { type: mongoose.Schema.Types.Mixed, required: false }
    },
    errorMessage: { type: String, required: false }
  },
  { timestamps: true }
);

RunSchema.index({ userId: 1, createdAt: -1 });

const Run = mongoose.model("Run", RunSchema);

module.exports = { Run };

