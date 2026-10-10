import { NextResponse } from "next/server";
import { fetchYouTubeMusicAlbum } from "@/utils/youtubeApi";
import { isMusicAlbumId } from "@/utils/artistMusicCatalog.mjs";
import { getClientKey, isRateLimited } from "@/utils/rateLimit";
import { apiError, handleApiError } from "@/utils/apiResponse";

export const runtime = "nodejs";
export const maxDuration = 15;

export async function GET(request) {
  try {
    const limit = await isRateLimited(getClientKey(request), { windowMs: 60_000, max: 30 });
    if (limit.limited) return apiError("RATE_LIMITED", { retryAfter: limit.retryAfter });
    const id = request.nextUrl.searchParams.get("id")?.trim() || "";
    if (!isMusicAlbumId(id)) {
      return apiError("VALIDATION_ERROR", { message: "A valid release id is required." });
    }
    return NextResponse.json(await fetchYouTubeMusicAlbum(id), {
      headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" },
    });
  } catch (error) {
    return handleApiError(error, "YouTube music release");
  }
}
