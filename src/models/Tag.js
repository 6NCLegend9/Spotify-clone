import mongoose from "mongoose";

const TAG_CATEGORIES = [
  "mood",
  "era",
  "scene",
  "production",
  "instrumentation",
  "language",
  "region",
  "theme",
  "other",
];

const tagSchema = new mongoose.Schema(
  {
    displayName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    normalizedName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 180,
    },
    category: {
      type: String,
      enum: TAG_CATEGORIES,
      default: "other",
      required: true,
    },
    aliases: {
      type: [String],
      default: [],
    },
    aliasKeys: {
      type: [String],
      default: [],
    },
    translations: {
      type: Map,
      of: String,
      default: {},
    },
    scope: {
      type: String,
      enum: ["system", "personal"],
      default: "system",
      required: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      default: null,
      required() {
        return this.scope === "personal";
      },
    },
  },
  { timestamps: true },
);

tagSchema.index({ slug: 1 }, { unique: true });
tagSchema.index({ scope: 1, ownerId: 1, normalizedName: 1 }, { unique: true });
tagSchema.index({ aliasKeys: 1 });
tagSchema.index({ category: 1, scope: 1, displayName: 1 });

export { TAG_CATEGORIES };
export default mongoose.models.tag || mongoose.model("tag", tagSchema, "tags");