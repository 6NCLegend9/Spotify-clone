import mongoose from "mongoose";

const schema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  hostId: { type: String, required: true },
  members: { type: [String], default: [] },
  startedAt: { type: Number, required: true },
  expiresAt: { type: Date, required: true },
  closed: { type: Boolean, default: false },
  persistent: { type: Boolean, default: false },
  name: { type: String },
  nameKey: { type: String },
  savedQueue: { type: Array, default: [] },
  savedTrack: { type: Object, default: null },
  hostSeenAt: { type: Date },
});
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
schema.index({ hostId: 1, nameKey: 1 }, { unique: true, sparse: true });
export default mongoose.models.jamRoom || mongoose.model("jamRoom", schema, "jamRooms");
