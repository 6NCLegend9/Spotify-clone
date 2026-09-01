import mongoose from "mongoose";
import { MAX_GENRE_DEPTH } from "@/utils/genreTaxonomy";

const genreSchema = new mongoose.Schema(
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
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "genre",
      default: null,
    },
    ancestorIds: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "genre",
      default: [],
    },
    depth: {
      type: Number,
      required: true,
      min: 0,
      max: MAX_GENRE_DEPTH,
      default: 0,
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

genreSchema.index({ slug: 1 }, { unique: true });
genreSchema.index(
  { scope: 1, ownerId: 1, parentId: 1, normalizedName: 1 },
  { unique: true },
);
genreSchema.index({ ancestorIds: 1 });
genreSchema.index({ aliasKeys: 1 });
genreSchema.index({ scope: 1, ownerId: 1, depth: 1, displayName: 1 });

export default mongoose.models.genre || mongoose.model("genre", genreSchema, "genres");