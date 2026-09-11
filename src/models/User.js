import mongoose from "mongoose";

const fileSchema = new mongoose.Schema(
  {
    userName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    password: {
      type: String,
      select: false,
    },
    sessionVersion: {
      type: Number,
      default: 0,
      min: 0,
      validate: Number.isSafeInteger,
    },
    imageUrl: {
      type: String,
      default: "/icon-192x192.png",
    },
    resetPasswordToken: {
      type: String,
      default: null,
    },
    resetPasswordExpires: {
      type: Date,
      default: null,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    verificationToken: {
      type: String,
      default: null,
    },
    verificationTokenExpires: {
      type: Date,
      default: null,
    },
    userData: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "userData",
    },
  },
  { timestamps: true }
);

export default mongoose.models.user ||
  mongoose.model("user", fileSchema, "user");
