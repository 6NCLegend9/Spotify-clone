import { NextResponse } from "next/server";
import { getClientKey, isRateLimited } from "@/utils/rateLimit";
import { apiError, handleApiError } from "@/utils/apiResponse";
import { isYoutubeVideoId } from "@/utils/youtubeComments.mjs";
import { fetchYouTubeCaptionLines } from "@/utils/youtubeApi";

export const runtime = "nodejs";
export const maxDuration = 20;

export async function GET(request) {
  try {
    const rateLimit = await isRateLimited(getClientKey(request), { windowMs: 60_000, max: 20 });
    if (rateLimit.limited) {
      return apiError("RATE_LIMITED", {
        retryAfter: rateLimit.retryAfter,
        message: "Too many caption requests. Please slow down.",
      });
    }

    const videoId = new URL(request.url).searchParams.get("videoId");
    if (!isYoutubeVideoId(videoId)) {
      return apiError("VALIDATION_ERROR", { message: "A valid video is required." });
    }

    const lines = await fetchYouTubeCaptionLines(videoId);
    return NextResponse.json(
      { lines },
      {
        headers: {
          "Cache-Control": lines.length > 0
            ? "public, max-age=300, s-maxage=1800"
            : "no-store",
        },
      },
    );
  } catch (error) {
    return handleApiError(error, "YouTube captions");
  }
}
