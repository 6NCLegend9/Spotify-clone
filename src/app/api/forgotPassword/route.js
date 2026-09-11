import crypto from "crypto";
import bcrypt from "bcryptjs";
import User from "@/models/User";
import mailSender from "@/utils/mailSender";
import dbConnect from "@/utils/dbconnect";
import { getResetPasswordTemplate } from "@/emails/ResetPasswordEmail";
import { getAppUrl, getPublicAssetUrl } from "@/utils/appUrl";
import { getClientKey, isRateLimited } from "@/utils/rateLimit";
import {
  apiError,
  apiSuccess,
  handleApiError,
  readRequestJson,
} from "@/utils/apiResponse";
import { EMAIL_PATTERN } from "@/utils/authErrors";
import { hashToken } from "@/utils/tokenHash.mjs";

export const runtime = "nodejs";
export const maxDuration = 30;

const RESET_REQUEST_RESPONSE = {
  title: "Check your email",
  message:
    "If an account matches that email, a reset link is on the way. It expires in 15 minutes.",
};

export async function POST(request) {
  try {
    const rateLimit = await isRateLimited(getClientKey(request), {
      windowMs: 15 * 60_000,
      max: 6,
    });
    if (rateLimit.limited) {
      return apiError("RATE_LIMITED", {
        retryAfter: rateLimit.retryAfter,
        message: "Too many reset attempts. Please try again later.",
      });
    }

    const payload = await readRequestJson(request);
    const email =
      typeof payload.email === "string"
        ? payload.email.trim().toLowerCase()
        : "";

    if (!email) {
      return apiError("VALIDATION_ERROR", {
        title: "Email required",
        message: "Please enter your email address.",
      });
    }

    if (!EMAIL_PATTERN.test(email) || email.length > 254) {
      return apiError("VALIDATION_ERROR", {
        title: "Invalid email",
        message: "Please enter a valid email address.",
      });
    }

    await dbConnect();
    const user = await User.findOne({ email });
    if (!user) {
      return apiSuccess(null, RESET_REQUEST_RESPONSE);
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenHash = hashToken(resetToken);
    user.resetPasswordToken = resetTokenHash;
    user.resetPasswordExpires = new Date(Date.now() + 15 * 60_000);
    await user.save();

    const url = `${getAppUrl(request)}/reset-password/${resetToken}`;
    try {
      await mailSender(
        user.email,
        "Reset Password - HeyKasa",
        getResetPasswordTemplate(url, {
          logoUrl: getPublicAssetUrl("/icon-192x192.png", request),
          lightPillarUrl: getPublicAssetUrl("/email-light-pillar.png", request),
        }),
      );
    } catch {
      await User.updateOne(
        { _id: user._id, resetPasswordToken: resetTokenHash },
        { $set: { resetPasswordToken: null, resetPasswordExpires: null } },
      ).catch(() => {});
      return apiSuccess(null, RESET_REQUEST_RESPONSE);
    }

    return apiSuccess(null, RESET_REQUEST_RESPONSE);
  } catch (error) {
    return handleApiError(error, "Forgot password");
  }
}

export async function PUT(request) {
  try {
    const rateLimit = await isRateLimited(getClientKey(request), {
      windowMs: 15 * 60_000,
      max: 10,
    });
    if (rateLimit.limited) {
      return apiError("RATE_LIMITED", {
        retryAfter: rateLimit.retryAfter,
        message: "Too many reset attempts. Please try again later.",
      });
    }

    const payload = await readRequestJson(request);
    const token = typeof payload.token === "string" ? payload.token.trim() : "";
    const password = typeof payload.password === "string" ? payload.password : "";
    const confirmPassword =
      typeof payload.confirmPassword === "string"
        ? payload.confirmPassword
        : "";

    if (!/^[a-f0-9]{64}$/i.test(token)) {
      return apiError("VALIDATION_ERROR", {
        title: "Invalid reset link",
        message: "Invalid or expired reset link.",
      });
    }
    if (password.length < 8 || password.length > 72) {
      return apiError("VALIDATION_ERROR", {
        title: "Invalid password",
        message: "Password must be between 8 and 72 characters.",
      });
    }
    if (password !== confirmPassword) {
      return apiError("VALIDATION_ERROR", {
        title: "Passwords don't match",
        message: "Passwords do not match.",
      });
    }

    await dbConnect();
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.findOneAndUpdate(
      {
        resetPasswordToken: hashToken(token),
        resetPasswordExpires: { $gt: Date.now() },
      },
      {
        $set: {
          password: hashedPassword,
          resetPasswordToken: null,
          resetPasswordExpires: null,
        },
        $inc: { sessionVersion: 1 },
      },
      { new: true },
    ).select("_id");

    if (!user) {
      return apiError("VALIDATION_ERROR", {
        title: "Invalid reset link",
        message: "Invalid or expired reset link.",
      });
    }

    return apiSuccess(null, {
      message: "Password updated successfully.",
    });
  } catch (error) {
    return handleApiError(error, "Reset password");
  }
}
