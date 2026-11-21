import mongoose from "mongoose";

// Store only a keyed digest of the narrow bearer. Never store session cookies
// or provider credentials. TTL cleanup is not the authorization expiry check.
const schema = new mongoose.Schema({
  grantId: { type: String, required: true, unique: true },
  tokenHash: { type: String, required: true, unique: true, select: false },
  accountId: { type: String, required: true, index: true },
  sessionVersion: { type: Number, required: true },
  deviceId: { type: String, required: true },
  videoIds: { type: [String], required: true },
  profile: { type: String, required: true },
  jobs: { type: [{ _id: false, jobId: String, subscriber: String }], default: [] },
  expiresAt: { type: Date, required: true, expires: 0 },
  sessionExpiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null },
}, { timestamps: true });
schema.index({ accountId: 1, sessionVersion: 1, deviceId: 1, revokedAt: 1 });

export default mongoose.models.nativePlaybackGrant || mongoose.model("nativePlaybackGrant", schema);
