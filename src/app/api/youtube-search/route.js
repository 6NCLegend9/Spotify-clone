import { NextResponse } from "next/server";
import { hasYouTubeApiKey, youtubeFetch } from "@/utils/youtubeApi";
import { getClientKey, isRateLimited } from "@/utils/rateLimit";
import {
  ApiRouteError,
  apiError,
  handleApiError,
} from "@/utils/apiResponse";

export const runtime = "nodejs";
export const maxDuration = 20;

function upstreamCode(status) {
  if (status === 429) return "RATE_LIMITED";
  if (status === 503) return "SERVICE_UNAVAILABLE";
  return "BAD_GATEWAY";
}

async function searchChannels(query) {
  const key = (process.env.YOUTUBE_API_KEY || "").trim();
  if (!key) {
    return { ok: true, status: 200, data: { items: [] } };
  }

  const params = new URLSearchParams({
    part: "snippet",
    type: "channel",
    maxResults: "12",
    q: query,
    key,
  });
  try {
    const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(6_000),
    });
    const data = await response.json().catch(() => null);
    return {
      ok: response.ok && Boolean(data),
      status: response.status,
      data,
    };
  } catch {
    throw new ApiRouteError("BAD_GATEWAY", {
      message: "Unable to reach YouTube.",
    });
  }
}

export async function GET(request) {
  try {
    const query = request.nextUrl.searchParams.get("q")?.trim();
    const type = request.nextUrl.searchParams.get("type") || "video";

    if (!query) {
      return apiError("VALIDATION_ERROR", { message: "A search query is required." });
    }

    if (query.length > 100 || !["video", "playlist", "channel"].includes(type)) {
      return apiError("VALIDATION_ERROR", { message: "Invalid search parameters." });
    }

    const rateLimit = await isRateLimited(getClientKey(request), { windowMs: 60_000, max: 30 });
    if (rateLimit.limited) {
      return apiError("RATE_LIMITED", {
        retryAfter: rateLimit.retryAfter,
        message: "Too many search requests. Please slow down.",
      });
    }

    if (!hasYouTubeApiKey()) {
      return apiError("SERVICE_UNAVAILABLE", {
        message: "YouTube search is not configured.",
      });
    }

    const params = {
      part: "snippet",
      type,
      maxResults: "12",
      q: type === "video" ? `${query} official audio` : query,
    };
    if (type === "video") {
      params.videoCategoryId = "10";
      params.videoEmbeddable = "true";
      params.videoSyndicated = "true";
    }

    const { ok, status, data } = type === "channel"
      ? await searchChannels(query)
      : await youtubeFetch("search", params, { next: { revalidate: 3600 } });

    if (!ok) {
      return apiError(upstreamCode(status), {
        message: "YouTube search failed.",
      });
    }

    const results = (Array.isArray(data?.items) ? data.items : [])
      .filter((item) => item?.id?.videoId || item?.id?.channelId || item?.id?.playlistId)
      .map((item) => ({
        id: item.id.videoId || item.id.channelId || item.id.playlistId,
        type,
        title: item.snippet?.title || "",
        channel: item.snippet?.channelTitle || "",
        channelId: item.snippet?.channelId || item.id?.channelId || "",
        description: item.snippet?.description || "",
        publishedAt: item.snippet?.publishedAt || "",
        thumbnail:
          item.snippet?.thumbnails?.high?.url
          || item.snippet?.thumbnails?.medium?.url
          || item.snippet?.thumbnails?.default?.url
          || "",
        seedQuery: query,
        genre: query,
      }));

    return NextResponse.json(
      { results },
      {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      },
    );
  } catch (error) {
    return handleApiError(error, "YouTube search");
  }
}

