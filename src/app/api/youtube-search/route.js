import { randomUUID } from "node:crypto";
import { withProviderRequest } from "@/utils/providerRequestContext.mjs";
import { logServerDiagnostic } from "@/utils/diagnostics.mjs";
import { NextResponse } from "next/server";
import { hasYouTubeApiKey, youtubeFetch, searchYouTubeChannels } from "@/utils/youtubeApi";
import { cleanTitle } from "@/utils/text";
import { getClientKey, isRateLimited } from "@/utils/rateLimit";
import { readSearchOptions } from "@/utils/searchOptions.mjs";
import { buildOfficialMusicQuery, rankOfficialMusicResults } from "@/utils/officialMusicSearch.mjs";
import { diversifyRadioTracks } from "@/utils/radioSeed.mjs";
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

function isRadioDiscoveryQuery(query, type, order) {
  return type === "video"
    && order === "relevance"
    && /\b(?:similar songs|radio mix)\s*$/i.test(String(query || ""));
}

function trackScopedDiscoverySeed(track) {
  const title = String(track?.title || "").trim();
  if (!title) return track;
  return {
    ...track,
    seedQuery: `${title} similar songs`,
    genre: `${title} radio mix`,
  };
}

export async function GET(request) {
  const requestId = randomUUID();
  const started = performance.now();
  return withProviderRequest(requestId, async () => {
    const response = await searchResponse(request);
    response.headers.set("X-Request-Id", requestId);
    logServerDiagnostic("request", { requestId, route: "/api/youtube-search", status: response.status, durationMs: performance.now() - started });
    return response;
  });
}

async function searchResponse(request) {
  try {
    const { query, type, order, duration, pageToken, requireOfficial } = readSearchOptions(new URL(request.url).searchParams);
    const radioDiscovery = isRadioDiscoveryQuery(query, type, order);

    const rateLimit = await isRateLimited(getClientKey(request), { windowMs: 60_000, max: 15 });
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

    const { ok, status, data, source } = type === "channel" && !requireOfficial
      ? await searchYouTubeChannels(query)
      : await youtubeFetch("search", params, { next: { revalidate: 3600 }, requireOfficial });

    if (!ok) {
      return apiError(upstreamCode(status), {
        message: requireOfficial ? "These search filters or this page are temporarily unavailable. Try relevance without filters." : "YouTube search failed.",
      });
    }

    const results = (Array.isArray(data?.items) ? data.items : [])
      .filter((item) => type !== "video" || item?.status?.embeddable !== false)
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
    const responseResults = radioDiscovery
      ? diversifyRadioTracks(rankedResults, {
        limit: 20,
        maxPerArtist: 2,
        artistGap: 2,
      }).map(trackScopedDiscoverySeed)
      : rankedResults;

    return NextResponse.json(
      { results: responseResults, source: source || "fallback", nextPageToken: typeof data?.nextPageToken === "string" ? data.nextPageToken : "" },
      {
        headers: {
          "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600",
        },
      },
    );
  } catch (error) {
    return handleApiError(error, "YouTube search");
  }
}
