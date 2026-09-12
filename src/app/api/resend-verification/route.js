import crypto from "crypto";
import dbConnect from "@/utils/dbconnect";
import User from "@/models/User";
import mailSender from "@/utils/mailSender";
import { getVerificationEmailTemplate } from "@/emails/VerificationEmail";
import { getAppUrl, getPublicAssetUrl } from "@/utils/appUrl";
import { getClientKey, isRateLimited } from "@/utils/rateLimit";
import { hashToken } from "@/utils/tokenHash.mjs";
import { EMAIL_PATTERN } from "@/utils/authErrors";
import { apiError, apiSuccess, handleApiError, readRequestJson } from "@/utils/apiResponse";

export const runtime = "nodejs";
export const maxDuration = 30;

const GENERIC_MESSAGE = "If an unverified account exists for that email, a new verification link has been sent.";

export async function POST(request) {
  try {
    const payload = await readRequestJson(request);
    const email = typeof payload.email === "string"
      ? payload.email.trim().toLowerCase()
      : "";

    if (!EMAIL_PATTERN.test(email) || email.length > 254) {
      return apiError("VALIDATION_ERROR", {
        title: "Invalid email",
        message: "Enter the email address used for your account.",
      });
    }

    const rateLimit = await isRateLimited(`${getClientKey(request)}:${email}`, {
      windowMs: 15 * 60_000,
      max: 3,
    });
    if (rateLimit.limited) {
      return apiError("RATE_LIMITED", {
        retryAfter: rateLimit.retryAfter,
        message: "Please wait before requesting another verification email.",
      });
    }

    await dbConnect();
    const user = await User.findOne({ email, isVerified: false })
      .select("_id userName email verificationTokenExpires");

    if (user) {
      const token = crypto.randomBytes(32).toString("hex");
      user.verificationToken = hashToken(token);
      user.verificationTokenExpires = Date.now() + 60 * 60_000;
      await user.save();

      const url = `${getAppUrl(request)}/verify-email/${token}`;
      const body = getVerificationEmailTemplate(user.userName, url, {
        logoUrl: getPublicAssetUrl("/icon-192x192.png", request),
        lightPillarUrl: getPublicAssetUrl("/email-light-pillar.png", request),
      });
      await mailSender(user.email, "Verify your HeyKasa email", body);
    }

    return apiSuccess(null, { message: GENERIC_MESSAGE });
  } catch (error) {
    return handleApiError(error, "Resend verification");
  }
}
