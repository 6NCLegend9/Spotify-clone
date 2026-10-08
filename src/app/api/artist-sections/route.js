import { NextResponse } from "next/server";
import { fetchYouTubeArtistSections } from "@/utils/youtubeApi";
import { getClientKey, isRateLimited } from "@/utils/rateLimit";
import { apiError, handleApiError } from "@/utils/apiResponse";

export const runtime = "nodejs";
export const maxDuration = 15;

export async function GET(request) {
  try {
    const limit = await isRateLimited(getClientKey(request), { windowMs: 60_000, max: 30 });
    if (limit.limited) return apiError("RATE_LIMITED", { retryAfter: limit.retryAfter });
    const id = request.nextUrl.searchParams.get("id")?.trim() || "";
    if (!/^UC[A-Za-z0-9_-]{20,24}$/.test(id)) {
      return apiError("VALIDATION_ERROR", { message: "A valid artist id is required." });
    }
    return NextResponse.json(await fetchYouTubeArtistSections(id), {
      headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" },
    });
  } catch (error) {
    return handleApiError(error, "Artist music catalog");
  }
}
