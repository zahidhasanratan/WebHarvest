const mongoose = require("mongoose");

const JobSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true, ref: "User" },
    name: { type: String, required: true },
    startUrl: { type: String, required: true },
    depth: { type: Number, default: 0, min: 0, max: 4 },
    extract: {
      type: [String],
      default: ["text", "links", "meta"],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0,
        message: "extract must include at least one type"
      }
    },
    options: {
      type: Object,
      default: {}
    },
    features: {
      type: Object,
      default: {}
    },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

JobSchema.index({ userId: 1, createdAt: -1 });

const Job = mongoose.model("Job", JobSchema);

module.exports = { Job };

