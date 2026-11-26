import mongoose from "mongoose";
import { MAX_PLAYLIST_ITEMS, PLAYLIST_ENTRY_ID, PLAYLIST_TRACK_ID } from "../utils/playlistItems.mjs";

const itemSchema = new mongoose.Schema({
  entryId: { type: String, required: true, maxlength: 128, match: PLAYLIST_ENTRY_ID },
  id: { type: String, required: true, match: PLAYLIST_TRACK_ID },
  addedAt: { type: Date, default: null },
}, { _id: false });

const fileSchema = new mongoose.Schema(
  {
    name: {
        type: String,
        required: true,
        maxlength: 80,
    },
    description: { type: String, default: "", maxlength: 300 },
    songs: {
      type: [String],
      default: [],
      validate: (values) => values.length <= 500 && values.every((id) => /^[A-Za-z0-9_-]{11}$/.test(id)),
    },
    items: {
      type: [itemSchema],
      default: undefined,
      validate: (items) => !items || (items.length <= MAX_PLAYLIST_ITEMS
        && new Set(items.map((item) => item.entryId)).size === items.length),
    },
    songAddedAt: {
        type: Map,
        of: Date,
        default: {}
    },
    songDurations: { type: Map, of: { type: Number, min: 1, max: 86400 }, default: {} },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user"
    },
    collaborators: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user"
      }
    ],
    visibility: {
      type: String,
      enum: ["public", "private"],
      default: "private"
    },
    pinned: {
      type: Boolean,
      default: false
    },
    smartShuffle: {
      type: Boolean,
      default: false
    },
    category: {
      type: String,
      enum: ["Sports", "Workout", "Chill", "Party", "Romance", "Gaming", "Hip-Hop", "Pop", "Rock"],
      default: "Pop",
    },
    subgenre: {
      type: String,
      default: "",
      maxlength: 48,
    },
    coverImage: {
      type: String,
      default: "",
      maxlength: 320000,
    },
    likedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
      },
    ],
  },
  { timestamps: true, optimisticConcurrency: true, toJSON: { flattenMaps: true } }
);

fileSchema.index({ user: 1, updatedAt: -1 });
fileSchema.index({ collaborators: 1 });

export default mongoose.models.playlist || mongoose.model("playlist", fileSchema, "playlist");
