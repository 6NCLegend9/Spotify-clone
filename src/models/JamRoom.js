import mongoose from "mongoose";
const schema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  hostId: { type: String, required: true },
  members: { type: [String], default: [] },
  startedAt: { type: Number, required: true },
  expiresAt: { type: Date, required: true },
  closed: { type: Boolean, default: false },
});
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export default mongoose.models.jamRoom || mongoose.model("jamRoom", schema, "jamRooms");
