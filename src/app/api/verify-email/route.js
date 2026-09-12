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
        const user = await User.findOneAndUpdate(
            {
                verificationToken: hashToken(token),
                verificationTokenExpires: { $gt: Date.now() },
                isVerified: false,
            },
            {
                $set: {
                    isVerified: true,
                    verificationToken: null,
                    verificationTokenExpires: null,
                },
            },
            { new: true },
        ).select("_id");

        if (!user) {
            return apiError("VALIDATION_ERROR", {
                title: "Invalid verification link",
                message: "The verification link is invalid, expired, or has already been used.",
            });
        }

        return apiSuccess(null, { message: "Email verified successfully." });
    } catch (error) {
        return handleApiError(error, "Email verification");
    }
}
