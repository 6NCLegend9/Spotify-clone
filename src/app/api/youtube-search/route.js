import { NextResponse } from "next/server";
import { hasYouTubeApiKey, youtubeFetch, searchChannelsViaInnertube } from "@/utils/youtubeApi";
import { cleanTitle } from "@/utils/text";
import { getClientKey, isRateLimited } from "@/utils/rateLimit";
import { readSearchOptions } from "@/utils/searchOptions.mjs";
import { buildOfficialMusicQuery, rankOfficialMusicResults } from "@/utils/officialMusicSearch.mjs";
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
  return searchChannelsViaInnertube(query, 12);
}

export async function GET(request) {
  try {
    const { query, type, order, duration, pageToken, requireOfficial } = readSearchOptions(new URL(request.url).searchParams);

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
      q: type === "video" ? buildOfficialMusicQuery(query) : query,
      order,
      ...(pageToken ? { pageToken } : {}),
    };
    if (type === "video") {
      // Keep the result set inside YouTube's Music category and reject sources
      // that cannot be played inside the app's embedded player.
      params.videoCategoryId = "10";
      params.videoEmbeddable = "true";
      params.videoSyndicated = "true";
      params.videoDuration = duration;
      params.safeSearch = "moderate";
    }

    const { ok, status, data } = type === "channel" && !requireOfficial
      ? await searchChannels(query)
      : await youtubeFetch("search", params, { next: { revalidate: 3600 }, requireOfficial });

    if (!ok) {
      return apiError(upstreamCode(status), {
        message: requireOfficial ? "These search filters or this page are temporarily unavailable. Try relevance without filters." : "YouTube search failed.",
      });
    }

    const results = (Array.isArray(data?.items) ? data.items : [])
      .filter((item) => item?.id?.videoId || item?.id?.channelId || item?.id?.playlistId)
      .map((item) => ({
        id: item.id.videoId || item.id.channelId || item.id.playlistId,
        type,
        title: cleanTitle(item.snippet?.title || ""),
        channel: cleanTitle(item.snippet?.channelTitle || ""),
        channelId: item.snippet?.channelId || item.id?.channelId || "",
        description: cleanTitle(item.snippet?.description || ""),
        publishedAt: item.snippet?.publishedAt || "",
        thumbnail:
          item.snippet?.thumbnails?.high?.url
          || item.snippet?.thumbnails?.medium?.url
          || item.snippet?.thumbnails?.default?.url
          || "",
        seedQuery: query,
        genre: query,
      }));

    const rankedResults = type === "video" && order === "relevance"
      ? rankOfficialMusicResults(results, query)
      : results;

    return NextResponse.json(
      { results: rankedResults, nextPageToken: typeof data?.nextPageToken === "string" ? data.nextPageToken : "" },
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
