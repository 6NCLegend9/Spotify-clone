import mongoose from "mongoose";

const rateLimitSchema = new mongoose.Schema(
  {
    keyHash: {
      type: String,
      required: true,
    },
    windowStart: {
      type: Date,
      required: true,
    },
    count: {
      type: Number,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    versionKey: false,
  },
);

rateLimitSchema.index({ keyHash: 1, windowStart: 1 }, { unique: true });
rateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.rateLimit
  || mongoose.model("rateLimit", rateLimitSchema, "rateLimits");
