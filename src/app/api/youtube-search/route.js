import { NextResponse } from "next/server";
import { hasYouTubeApiKey, youtubeFetch, searchChannelsViaInnertube } from "@/utils/youtubeApi";
import { getClientKey, isRateLimited } from "@/utils/rateLimit";
import {
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

// Rank official artist sources (exact channel, VEVO, "- Topic" audio, "official")
// above random re-uploaders. Non-artist/song searches score 0 and keep YouTube's
// original relevance order.
function officialChannelScore(channelTitle, query) {
  const channel = String(channelTitle || "").toLowerCase().trim();
  const q = String(query || "").toLowerCase().trim();
  if (!channel || !q) return 0;
  const base = channel.replace(/\s*-\s*topic$/, "").replace(/vevo$/, "").trim();
  let score = 0;
  if (channel === q || base === q) score += 100;
  if (/vevo$/.test(channel)) score += 60;
  if (/\s-\stopic$/.test(channel)) score += 50;
  if (channel.includes(q) || (base && q.includes(base))) score += 30;
  if (channel.includes("official")) score += 20;
  return score;
}

function rankVideoResults(results, query) {
  return results
    .map((result, index) => ({ result, index, score: officialChannelScore(result.channel, query) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.result);
}

async function searchChannels(query) {
  const key = (process.env.YOUTUBE_API_KEY || "").trim();
  if (key) {
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
      const items = Array.isArray(data?.items) ? data.items : [];
      if (response.ok && items.length > 0) {
        return { ok: true, status: response.status, data };
      }
    } catch {
      // Fall through to the no-key Innertube lookup below.
    }
  }
  // No key, quota exhausted, or empty result -> resolve channels without the Data API.
  return searchChannelsViaInnertube(query, 12);
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
      maxResults: type === "video" ? "20" : "12",
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

    const rankedResults = type === "video"
      ? rankVideoResults(results, query).slice(0, 12)
      : results;

    return NextResponse.json(
      { results: rankedResults },
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

