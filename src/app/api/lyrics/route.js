import { NextResponse } from "next/server";
import { getClientKey, isRateLimited } from "@/utils/rateLimit";
import { parseArtistAndTitle, parseLrc, pickBestLyrics, plainToLines } from "@/utils/lyricsLookup";
import {
  ApiRouteError,
  apiError,
  handleApiError,
} from "@/utils/apiResponse";

const LRCLIB = "https://lrclib.net/api";
const HEADERS = {
  Accept: "application/json",
  "User-Agent": "HayKasa/1.0 (https://github.com/6NCLegend9/Spotify-clone)",
};

export const runtime = "nodejs";
export const maxDuration = 15;

function upstreamError(status) {
  const code = status === 429
    ? "RATE_LIMITED"
    : status === 503
      ? "SERVICE_UNAVAILABLE"
      : "BAD_GATEWAY";
  return new ApiRouteError(code, {
    message: "Lyrics are temporarily unavailable.",
  });
}

async function responseJson(response) {
  try {
    return await response.json();
  } catch {
    throw upstreamError(502);
  }
}

async function lrclibGet(params) {
  let response;
  try {
    const url = `${LRCLIB}/get?${params}`;
    response = await fetch(url, {
      headers: HEADERS,
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    throw upstreamError(502);
  }
  if (response.status === 404) return null;
  if (!response.ok) throw upstreamError(response.status);
  const data = await responseJson(response);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw upstreamError(502);
  }
  return data;
}

async function lrclibSearch(params) {
  let response;
  try {
    const url = `${LRCLIB}/search?${params}`;
    response = await fetch(url, {
      headers: HEADERS,
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    throw upstreamError(502);
  }
  if (!response.ok) throw upstreamError(response.status);
  const data = await responseJson(response);
  if (!Array.isArray(data)) throw upstreamError(502);
  return data;
}

function toPayload(hit) {
  if (!hit) return null;
  const synced = parseLrc(hit.syncedLyrics || "");
  const plain = hit.plainLyrics || "";
  const lines = synced.length > 0 ? synced : plainToLines(plain);
  if (lines.length === 0 && !hit.instrumental) return null;
  return {
    trackName: hit.name || "",
    artistName: hit.artistName || "",
    albumName: hit.albumName || "",
    instrumental: Boolean(hit.instrumental),
    synced: synced.length > 0,
    live: synced.length > 0,
    lines,
    plain: plain || null,
  };
}

export async function GET(request) {
  try {
    const title = request.nextUrl.searchParams.get("title")?.trim().slice(0, 200) || "";
    const artist = request.nextUrl.searchParams.get("artist")?.trim().slice(0, 200) || "";
    const requestedDuration = Number(request.nextUrl.searchParams.get("duration"));
    const duration =
      Number.isFinite(requestedDuration) && requestedDuration > 0 && requestedDuration <= 86_400
        ? requestedDuration
        : 0;

    if (!title && !artist) {
      return apiError("VALIDATION_ERROR", { message: "A title or artist is required." });
    }

    const rateLimit = await isRateLimited(getClientKey(request), { windowMs: 60_000, max: 24 });
    if (rateLimit.limited) {
      return apiError("RATE_LIMITED", {
        retryAfter: rateLimit.retryAfter,
        message: "Too many lyrics requests. Please slow down.",
      });
    }

    const parsed = parseArtistAndTitle(title, artist);
    const trackName = parsed.title || title;
    const artistName = parsed.artist || artist;
    const getParams = new URLSearchParams({
      track_name: trackName,
      artist_name: artistName,
    });
    if (duration > 0) getParams.set("duration", String(Math.round(duration)));

    let hit = await lrclibGet(getParams);

    if (!hit) {
      const named = await lrclibSearch(new URLSearchParams({
        track_name: trackName,
        artist_name: artistName,
      }));
      hit = pickBestLyrics(named, duration);
    }

    if (!hit) {
      const q = [artistName, trackName].filter(Boolean).join(" ");
      const searched = await lrclibSearch(new URLSearchParams({ q }));
      hit = pickBestLyrics(searched, duration);
    }

    const payload = toPayload(hit);
    if (!payload) {
      return NextResponse.json({
        trackName,
        artistName,
        instrumental: false,
        synced: false,
        live: false,
        lines: [],
        plain: null,
      }, {
        headers: {
          "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600",
        },
      });
    }
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    return handleApiError(error, "Load lyrics");
  }
}
