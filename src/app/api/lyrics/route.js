import { NextResponse } from "next/server";
import { getClientKey, isRateLimited } from "@/utils/rateLimit";
import { parseArtistAndTitle, parseLrc, pickBestLyrics, plainToLines } from "@/utils/lyricsLookup";

const LRCLIB = "https://lrclib.net/api";
const HEADERS = {
  Accept: "application/json",
  "User-Agent": "Hayasaka/1.0 (https://github.com/6NCLegend9/Spotify-clone)",
};

async function lrclibGet(params) {
  const url = `${LRCLIB}/get?${params}`;
  const response = await fetch(url, { headers: HEADERS, next: { revalidate: 86400 } });
  if (response.status === 404) return null;
  if (!response.ok) return null;
  return response.json();
}

async function lrclibSearch(params) {
  const url = `${LRCLIB}/search?${params}`;
  const response = await fetch(url, { headers: HEADERS, next: { revalidate: 86400 } });
  if (!response.ok) return [];
  const data = await response.json();
  return Array.isArray(data) ? data : [];
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
  const title = request.nextUrl.searchParams.get("title")?.trim() || "";
  const artist = request.nextUrl.searchParams.get("artist")?.trim() || "";
  const duration = Number(request.nextUrl.searchParams.get("duration")) || 0;

  if (!title && !artist) {
    return NextResponse.json({ error: "A title or artist is required." }, { status: 400 });
  }

  if (isRateLimited(getClientKey(request), { windowMs: 60_000, max: 24 })) {
    return NextResponse.json({ error: "Too many lyrics requests. Please slow down." }, { status: 429 });
  }

  try {
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
      });
    }
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Lyrics error:", error);
    return NextResponse.json({ error: "Unable to load lyrics." }, { status: 502 });
  }
}
