import { NextResponse } from "next/server";
import { hasYouTubeApiKey, youtubeFetch } from "@/utils/youtubeApi";
import { cleanTitle } from "@/utils/text";
import { getClientKey, isRateLimited } from "@/utils/rateLimit";
import { apiError, handleApiError } from "@/utils/apiResponse";

const PAGE_TOKEN_PATTERN = /^[A-Za-z0-9_=-]{1,512}$/;

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

    const pageToken = request.nextUrl.searchParams.get("pageToken") || "";
    if (pageToken && !PAGE_TOKEN_PATTERN.test(pageToken)) {
      return apiError("VALIDATION_ERROR", { message: "A valid page token is required." });
    }

    const params = {
      part: "snippet,status",
      playlistId,
      maxResults: "50",
      ...(pageToken ? { pageToken } : {}),
    };

    const { ok, status, data } = await youtubeFetch("playlistItems", params, { next: { revalidate: 900 } });

    if (!ok) {
      if (status === 400 || status === 404) {
        return apiError("NOT_FOUND", {
          title: "This playlist page is unavailable",
          message: "Search for the playlist to open its songs in HayKasa.",
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

    // Direct/shared links need authoritative metadata, even without URL hints.
    // Later pages keep the first page's metadata and avoid another upstream call.
    let playlist = null;
    if (!pageToken) {
      const meta = await youtubeFetch("playlists", {
        part: "snippet,contentDetails",
        id: playlistId,
        maxResults: "1",
      }, { next: { revalidate: 900 } });
      if (!meta.ok) {
        return apiError(upstreamCode(meta.status), { message: "This playlist could not be loaded." });
      }
      const item = meta.data?.items?.[0];
      if (!item) {
        return apiError("NOT_FOUND", {
          title: "This playlist page is unavailable",
          message: "The playlist may be private or may have been removed.",
        });
      }
      playlist = {
        id: playlistId,
        title: cleanTitle(item.snippet?.title || "Playlist"),
        channel: cleanTitle(item.snippet?.channelTitle || ""),
        thumbnail: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.medium?.url || "",
      };
    }

    return NextResponse.json(
      { tracks, playlist, nextPageToken: data?.nextPageToken || "" },
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


