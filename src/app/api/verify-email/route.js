import dbConnect from "@/utils/dbconnect";
import User from "@/models/User";
import { getClientKey, isRateLimited } from "@/utils/rateLimit";
import { hashToken } from "@/utils/tokenHash.mjs";
import {
    apiError,
    apiSuccess,
    handleApiError,
    readRequestJson,
} from "@/utils/apiResponse";

export const runtime = "nodejs";
export const maxDuration = 15;

export async function POST(request) {
    try {
        const rateLimit = await isRateLimited(getClientKey(request), {
            windowMs: 15 * 60_000,
            max: 20,
        });
        if (rateLimit.limited) {
            return apiError("RATE_LIMITED", {
                retryAfter: rateLimit.retryAfter,
                message: "Too many verification attempts. Please try again later.",
            });
        }

        const payload = await readRequestJson(request);
        const token = typeof payload.token === "string" ? payload.token.trim() : "";

        if (!/^[a-f0-9]{64}$/i.test(token)) {
            return apiError("VALIDATION_ERROR", {
                title: "Invalid verification link",
                message: "The verification link is invalid or has expired.",
            });
        }

        await dbConnect();
        const tokenHash = hashToken(token);

        const user = await User.findOne({
            verificationToken: tokenHash,
            verificationTokenExpires: { $gt: Date.now() }
        });

        if (!user) {
            return apiError("VALIDATION_ERROR", {
                title: "Invalid verification link",
                message: "The verification link is invalid or has expired.",
            });
        }

        user.isVerified = true;
        user.verificationToken = null;
        user.verificationTokenExpires = null;
        await user.save();

        return apiSuccess(null, { message: "Email verified successfully." });
    } catch (error) {
        return handleApiError(error, "Email verification");
    }
}
