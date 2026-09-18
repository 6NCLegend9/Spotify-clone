import mongoose from "mongoose";

const trackSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      validate: (value) => /^[A-Za-z0-9_-]{11}$/.test(value),
    },
    plays: {
      type: Number,
      min: 0,
      max: 1_000_000_000,
      default: 0,
    },
  },
  { _id: false },
);

const schema = new mongoose.Schema(
  {
    weekKey: {
      type: String,
      required: true,
      unique: true,
      match: /^\d{4}-W\d{2}$/,
    },
    tracks: {
      type: [trackSchema],
      default: [],
      validate: (values) => values.length <= 40,
    },
  },
  { timestamps: true },
);

export default mongoose.models.weekPulse || mongoose.model("weekPulse", schema, "weekPulses");
