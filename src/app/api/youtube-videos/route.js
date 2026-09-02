import { NextResponse } from "next/server";
import { hasYouTubeApiKey, youtubeFetch } from "@/utils/youtubeApi";
import { getClientKey, isRateLimited } from "@/utils/rateLimit";
import { apiError, handleApiError } from "@/utils/apiResponse";

const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export const runtime = "nodejs";
export const maxDuration = 20;

function parseDuration(value = "") {
  const match = value.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;

  const [, hours = 0, minutes = 0, seconds = 0] = match;
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

function upstreamCode(status) {
  if (status === 429) return "RATE_LIMITED";
  if (status === 503) return "SERVICE_UNAVAILABLE";
  return "BAD_GATEWAY";
}

export async function GET(request) {
  try {
    const rateLimit = await isRateLimited(getClientKey(request), { windowMs: 60_000, max: 40 });
    if (rateLimit.limited) {
      return apiError("RATE_LIMITED", {
        retryAfter: rateLimit.retryAfter,
        message: "Too many requests. Please slow down and try again shortly.",
      });
    }

    if (!hasYouTubeApiKey()) {
      return apiError("SERVICE_UNAVAILABLE", {
        message: "YouTube video details are not configured.",
      });
    }

    const idParameters = request.nextUrl.searchParams.getAll("id");
    if (idParameters.reduce((length, value) => length + value.length, 0) > 1_000) {
      return apiError("VALIDATION_ERROR", { message: "Too many video identifiers were provided." });
    }
    const requestedIds = idParameters.flatMap((value) => value.split(","));
    const ids = [...new Set(requestedIds.filter((id) => YOUTUBE_ID_PATTERN.test(id)))].slice(0, 50);

    if (ids.length === 0) {
      return NextResponse.json({ tracks: [] });
    }

    const params = {
      part: "snippet,contentDetails",
      id: ids.join(","),
    };

    const { ok, status, data } = await youtubeFetch("videos", params, { next: { revalidate: 3600 } });

    if (!ok) {
      return apiError(upstreamCode(status), {
        message: "YouTube video details could not be loaded.",
      });
    }

    const tracks = (Array.isArray(data?.items) ? data.items : [])
      .filter((item) => typeof item?.id === "string" && item.snippet)
      .map((item) => ({
        id: item.id,
        title: item.snippet.title || "",
        channel: item.snippet.channelTitle || "",
        description: item.snippet.description || "",
        publishedAt: item.snippet.publishedAt || "",
        thumbnail:
          item.snippet.thumbnails?.high?.url ||
          item.snippet.thumbnails?.medium?.url ||
          item.snippet.thumbnails?.default?.url ||
          "",
        duration: parseDuration(item.contentDetails?.duration),
      }));

    const order = new Map(ids.map((id, index) => [id, index]));
    tracks.sort((left, right) => order.get(left.id) - order.get(right.id));

    return NextResponse.json(
      { tracks },
      {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      },
    );
  } catch (error) {
    return handleApiError(error, "YouTube video details");
  }
}
