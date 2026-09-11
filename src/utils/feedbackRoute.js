import UserData from "@/models/UserData";
import { getAuthenticatedAccount } from "@/utils/userAccount";
import { apiError, apiSuccess, handleApiError, readRequestJson } from "@/utils/apiResponse";
import { isRateLimited } from "@/utils/rateLimit";
import { mutateDocument } from "@/utils/documentMutation.mjs";
import { activeSnoozedTracks, updateFeedback } from "@/utils/recommendationFeedback.mjs";

export function feedbackHandlers(field) {
  const headers = { "Cache-Control": "private, no-store" };
  const read = (profile) => field === "snoozedTracks" ? activeSnoozedTracks(profile) : profile[field] || [];
  const write = (remove) => async (request) => {
    try {
      const { user, userData } = await getAuthenticatedAccount(request);
      const limit = await isRateLimited(`feedback:${user._id}`, { windowMs: 900_000, max: 100 });
      if (limit.limited) return apiError("RATE_LIMITED", { retryAfter: limit.retryAfter });
      const { id } = await readRequestJson(request);
      if (typeof id !== "string" || !/^[A-Za-z0-9_-]{11}$/.test(id)) return apiError("VALIDATION_ERROR");
      const updated = await mutateDocument(UserData, userData._id, (current) => updateFeedback(current, field, id, remove));
      return apiSuccess(read(updated), { headers, message: remove ? "Track restored" : "Preference saved" });
    } catch (error) { return handleApiError(error, "Update recommendation feedback"); }
  };
  return {
    POST: write(false), DELETE: write(true),
    async GET(request) {
      try {
        const { userData } = await getAuthenticatedAccount(request);
        return apiSuccess(read(userData), { headers });
      } catch (error) { return handleApiError(error, "Read recommendation feedback"); }
    },
  };
}