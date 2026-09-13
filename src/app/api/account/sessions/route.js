import User from "@/models/User";
import { getSessionUser } from "@/utils/sessionAuth";
import { isRateLimited } from "@/utils/rateLimit";
import { apiError, apiSuccess, handleApiError, readRequestJson } from "@/utils/apiResponse";
import { isTrustedRequestOrigin } from "@/utils/trustedOrigin";

export const runtime = "nodejs";
export const maxDuration = 15;

export async function POST(request) {
  try {
    if (!isTrustedRequestOrigin(request)) {
      return apiError("FORBIDDEN");
    }
    const user = await getSessionUser(request);
    if (!user) return apiError("UNAUTHORIZED");
    const body = await readRequestJson(request);
    if (body.confirm !== true) {
      return apiError("VALIDATION_ERROR", { message: "Confirm signing out all devices." });
    }
    const limit = await isRateLimited(`sessions:revoke:${user._id}`, { windowMs: 60_000, max: 5 });
    if (limit.limited) return apiError("RATE_LIMITED", { retryAfter: limit.retryAfter });
    const result = await User.updateOne({ _id: user._id }, { $inc: { sessionVersion: 1 } });
    if (!result.matchedCount) return apiError("UNAUTHORIZED");
    return apiSuccess(null, {
      message: "All devices signed out.",
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return handleApiError(error, "Revoke account sessions");
  }
}