import { NextResponse } from "next/server";
import { getClientKey, isRateLimited } from "@/utils/rateLimit";
import { apiError, handleApiError } from "@/utils/apiResponse";
import { fetchChannelAlsoPlayed } from "@/utils/youtubeApi";

export const runtime = "nodejs";
export const maxDuration = 30;

const CHANNEL_ID_PATTERN = /^UC[A-Za-z0-9_-]{20,24}$/;

export async function GET(request) {
  try {
    const rateLimit = await isRateLimited(getClientKey(request), { windowMs: 60_000, max: 20 });
    if (rateLimit.limited) {
      return apiError("RATE_LIMITED", {
        retryAfter: rateLimit.retryAfter,
        message: "Too many requests. Please slow down and try again shortly.",
      });
    }

    const channelId = request.nextUrl.searchParams.get("id")?.trim() || "";
    const name = request.nextUrl.searchParams.get("name")?.trim().slice(0, 120) || "";
    const seedIds = request.nextUrl.searchParams.getAll("video");
    if (!CHANNEL_ID_PATTERN.test(channelId)) {
      return apiError("VALIDATION_ERROR", { message: "A valid artist id is required." });
    }

    const tracks = await fetchChannelAlsoPlayed(channelId, { name, seedIds });
    return NextResponse.json(
      { tracks },
      { headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" } },
    );
  } catch (error) {
    return handleApiError(error, "Channel rabbit hole");
  }
}
