import { NextResponse } from "next/server";
import { hasYouTubeApiKey, youtubeFetch } from "@/utils/youtubeApi";
import { cleanTitle } from "@/utils/text";
import { getClientKey, isRateLimited } from "@/utils/rateLimit";
import { apiError, handleApiError } from "@/utils/apiResponse";

const PAGE_TOKEN_PATTERN = /^[A-Za-z0-9_=-]{1,512}$/;
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

function mergeTracks(previous, incoming) {
  const seen = new Set(previous.map((track) => track.id));
  const next = [...previous];
  for (const track of incoming) {
    if (!track?.id || seen.has(track.id)) continue;
    seen.add(track.id);
    next.push(track);
  }
  return next;
}

async function fetchPlaylistTracks(playlistId, { pageToken = "", limit = MAX_PLAYLIST_TRACKS } = {}) {
  const tracks = [];
  let token = pageToken;
  let nextPageToken = "";
  let lastStatus = 200;
  // Explicit pageToken requests are "Load more" requests: fetch one YouTube page.
  const maxPages = pageToken ? 1 : Math.ceil(limit / 50);

  for (let page = 0; page < maxPages && tracks.length < limit; page += 1) {
    const params = {
      part: "snippet,status",
      playlistId,
      maxResults: String(Math.min(50, limit - tracks.length)),
      ...(token ? { pageToken: token } : {}),
    };
    const { ok, status, data } = await youtubeFetch("playlistItems", params, {
      next: { revalidate: 900 },
    });
    lastStatus = status;
    if (!ok) return { ok: false, status: lastStatus, tracks, nextPageToken: "" };
    const mapped = mapPlaylistTracks(data?.items);
    tracks.splice(0, tracks.length, ...mergeTracks(tracks, mapped));
    nextPageToken = typeof data?.nextPageToken === "string" ? data.nextPageToken : "";
    token = nextPageToken;
    if (!token) break;
  }

  return { ok: true, status: lastStatus, tracks: tracks.slice(0, limit), nextPageToken };
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

    const result = await fetchPlaylistTracks(playlistId, {
      pageToken,
      limit: pageToken ? 50 : MAX_PLAYLIST_TRACKS,
    });

    if (!result.ok) {
      if (result.status === 400 || result.status === 404) {
        return apiError("NOT_FOUND", {
          title: "This playlist page is unavailable",
          message: "Search for the playlist to open its songs in HayKasa.",
        });
      }
      return apiError(upstreamCode(result.status), {
        message: "This playlist could not be loaded.",
      });
    }

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
      {
        tracks: result.tracks,
        playlist,
        nextPageToken: result.nextPageToken,
        limit: pageToken ? 50 : MAX_PLAYLIST_TRACKS,
      },
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
