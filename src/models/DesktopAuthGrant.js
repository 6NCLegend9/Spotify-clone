import mongoose from "mongoose";

const desktopAuthGrantSchema = new mongoose.Schema(
  {
    codeHash: { type: String, required: true, unique: true, maxlength: 64 },
    stateHash: { type: String, required: true, maxlength: 64 },
    pkceChallenge: { type: String, required: true, maxlength: 43 },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true, index: true },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

desktopAuthGrantSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.desktopAuthGrant
  || mongoose.model("desktopAuthGrant", desktopAuthGrantSchema, "desktopAuthGrant");
