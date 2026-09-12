import { NextResponse } from "next/server";
import { hasYouTubeApiKey, youtubeFetch } from "@/utils/youtubeApi";
import { cleanTitle } from "@/utils/text";
import { getClientKey, isRateLimited } from "@/utils/rateLimit";
import { apiError, handleApiError } from "@/utils/apiResponse";

const PLAYLIST_ID_PATTERN = /^[A-Za-z0-9_-]{2,64}$/;

export const runtime = "nodejs";
export const maxDuration = 20;

function upstreamCode(status) {
  if (status === 429) return "RATE_LIMITED";
  if (status === 503) return "SERVICE_UNAVAILABLE";
  return "BAD_GATEWAY";
}

export async function GET(request) {
  try {
    const rateLimit = await isRateLimited(getClientKey(request), { windowMs: 60_000, max: 30 });
    if (rateLimit.limited) {
      return apiError("RATE_LIMITED", {
        retryAfter: rateLimit.retryAfter,
        message: "Too many requests. Please slow down and try again shortly.",
      });
    }

    if (!hasYouTubeApiKey()) {
      return apiError("SERVICE_UNAVAILABLE", {
        message: "YouTube playlists are not configured.",
      });
    }

    const playlistId = request.nextUrl.searchParams.get("id");
    if (!playlistId || !PLAYLIST_ID_PATTERN.test(playlistId)) {
      return apiError("VALIDATION_ERROR", { message: "A valid playlist id is required." });
    }

    const params = {
      part: "snippet,status",
      playlistId,
      maxResults: "25",
    };

    const { ok, status, data } = await youtubeFetch("playlistItems", params, { next: { revalidate: 900 } });

    if (!ok) {
      if (status === 400 || status === 404) {
        return apiError("NOT_FOUND", {
          title: "This playlist page is unavailable",
          message: "Search for the playlist to open its songs in HeyKasa.",
        });
      }
      return apiError(upstreamCode(status), {
        message: "This playlist could not be loaded.",
      });
    }

    const tracks = (Array.isArray(data?.items) ? data.items : [])
      .filter((item) => item?.snippet?.resourceId?.videoId && item?.status?.privacyStatus === "public")
      .map((item) => ({
        id: item.snippet.resourceId.videoId,
        title: cleanTitle(item.snippet.title || ""),
        channel: cleanTitle(item.snippet.videoOwnerChannelTitle || item.snippet.channelTitle || ""),
        thumbnail:
          item.snippet.thumbnails?.high?.url ||
          item.snippet.thumbnails?.medium?.url ||
          item.snippet.thumbnails?.default?.url ||
          "",
      }));

    if (!tracks.length) {
      const meta = await youtubeFetch("playlists", {
        part: "id",
        id: playlistId,
        maxResults: "1",
      }, { next: { revalidate: 900 } });
      if (!meta.ok || !Array.isArray(meta.data?.items) || meta.data.items.length === 0) {
        return apiError("NOT_FOUND", {
          title: "This playlist page is unavailable",
          message: "Search for the playlist to open its songs in HeyKasa.",
        });
      }
    }

    return NextResponse.json(
      { tracks },
      {
        headers: {
          "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600",
        },
      },
    );
  } catch (error) {
    return handleApiError(error, "YouTube playlist");
  }
}

