import { getClientKey, isRateLimited } from "@/utils/rateLimit";
import { apiError, apiSuccess, handleApiError } from "@/utils/apiResponse";
import { fetchYouTubeComments } from "@/utils/youtubeApi";
import { isYoutubeVideoId } from "@/utils/youtubeComments.mjs";

export const runtime = "nodejs";
export const maxDuration = 15;

export async function GET(request) {
  try {
    const rateLimit = await isRateLimited(getClientKey(request), { windowMs: 60_000, max: 20 });
    if (rateLimit.limited) {
      return apiError("RATE_LIMITED", {
        retryAfter: rateLimit.retryAfter,
        message: "Too many comment requests. Please slow down.",
      });
    }

    const videoId = new URL(request.url).searchParams.get("videoId");
    if (!isYoutubeVideoId(videoId)) {
      return apiError("VALIDATION_ERROR", { message: "A valid video is required." });
    }

    const comments = await fetchYouTubeComments(videoId);
    return apiSuccess({ comments }, {
      headers: { "Cache-Control": "public, max-age=120, s-maxage=300" },
    });
  } catch (error) {
    return handleApiError(error, "YouTube comments");
  }
}
