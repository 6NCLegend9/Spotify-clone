import crypto from "crypto";
import bcrypt from "bcryptjs";
import User from "@/models/User";
import mailSender from "@/utils/mailSender";
import dbConnect from "@/utils/dbconnect";
import { getResetPasswordTemplate } from "@/emails/ResetPasswordEmail";
import { getAppLink, getPublicAssetUrl } from "@/utils/appUrl";
import { getClientKey, isRateLimited } from "@/utils/rateLimit";
import {
  apiError,
  apiSuccess,
  handleApiError,
  readRequestJson,
} from "@/utils/apiResponse";
import {
  normalizeEmail,
  validateEmail,
  validatePassword,
} from "@/utils/authErrors";
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
    const email = normalizeEmail(payload.email);

    const emailError = validateEmail(email);
    if (emailError) {
      return apiError("VALIDATION_ERROR", {
        title: emailError.title,
        message: emailError.message,
      });
    }

    await dbConnect();
    const user = await User.findOne({ email });
    if (!user) {
      return apiSuccess(null, RESET_REQUEST_RESPONSE);
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenHash = hashToken(resetToken);
    const previousToken = user.resetPasswordToken ?? null;
    const previousExpiry = user.resetPasswordExpires ?? null;
    user.resetPasswordToken = resetTokenHash;
    user.resetPasswordExpires = new Date(Date.now() + 15 * 60_000);
    await user.save();

    const url = getAppLink(`/reset-password/${resetToken}`, request);
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
        {
          $set: {
            resetPasswordToken: previousToken,
            resetPasswordExpires: previousExpiry,
          },
        },
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
    const passwordError = validatePassword(password, { confirm: confirmPassword });
    if (passwordError) {
      return apiError("VALIDATION_ERROR", {
        title: passwordError.title,
        message: passwordError.message,
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
