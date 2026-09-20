import mongoose from "mongoose";

const fileSchema = new mongoose.Schema(
  {
    name: {
        type: String,
        required: true
    },
    songs: {
      type: [String],
      default: [],
      validate: (values) => values.length <= 500 && values.every((id) => /^[A-Za-z0-9_-]{11}$/.test(id)),
    },
    songAddedAt: {
        type: Map,
        of: Date,
        default: {}
    },
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