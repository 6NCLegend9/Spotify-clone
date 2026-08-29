import mongoose from "mongoose";

const fileSchema = new mongoose.Schema(
  {
    name: {
        type: String,
        required: true
    },
    songs: {
        type: Array,
        default: []
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
  },
  { timestamps: true, toJSON: { flattenMaps: true } }
);

export default mongoose.models.playlist || mongoose.model("playlist", fileSchema, "playlist");