import { NextResponse } from "next/server";
import { hasYouTubeApiKey, youtubeFetch } from "@/utils/youtubeApi";
import { cleanTitle } from "@/utils/text";
import { getClientKey, isRateLimited } from "@/utils/rateLimit";
import { apiError, handleApiError } from "@/utils/apiResponse";

const PLAYLIST_ID_PATTERN = /^[A-Za-z0-9_-]{2,64}$/;
const MAX_PLAYLIST_TRACKS = 100;

export const runtime = "nodejs";
export const maxDuration = 20;

function upstreamCode(status) {
  if (status === 429) return "RATE_LIMITED";
  if (status === 503) return "SERVICE_UNAVAILABLE";
  return "BAD_GATEWAY";
}

function mapPlaylistTracks(items) {
  return (Array.isArray(items) ? items : [])
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
}

async function fetchPlaylistTracks(playlistId, limit = MAX_PLAYLIST_TRACKS) {
  const tracks = [];
  let pageToken = "";
  let lastStatus = 200;
  const maxPages = Math.ceil(limit / 50);

  for (let page = 0; page < maxPages && tracks.length < limit; page += 1) {
    const params = {
      part: "snippet,status",
      playlistId,
      maxResults: String(Math.min(50, limit - tracks.length)),
    };
    if (pageToken) params.pageToken = pageToken;

    const { ok, status, data } = await youtubeFetch("playlistItems", params, {
      next: { revalidate: 900 },
    });
    lastStatus = status;
    if (!ok) {
      return { ok: false, status: lastStatus, tracks };
    }
    tracks.push(...mapPlaylistTracks(data?.items));
    pageToken = typeof data?.nextPageToken === "string" ? data.nextPageToken : "";
    if (!pageToken) break;
  }

  return { ok: true, status: lastStatus, tracks: tracks.slice(0, limit) };
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

    const { ok, status, tracks } = await fetchPlaylistTracks(playlistId, MAX_PLAYLIST_TRACKS);

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

    if (!tracks.length) {
      const meta = await youtubeFetch("playlists", {
        part: "id",
        id: playlistId,
        maxResults: "1",
      }, { next: { revalidate: 900 } });
      if (!meta.ok || !Array.isArray(meta.data?.items) || meta.data.items.length === 0) {
        return apiError("NOT_FOUND", {
          title: "This playlist page is unavailable",
          message: "Search for the playlist to open its songs in HayKasa.",
        });
      }
    }

    return NextResponse.json(
      { tracks, limit: MAX_PLAYLIST_TRACKS },
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
