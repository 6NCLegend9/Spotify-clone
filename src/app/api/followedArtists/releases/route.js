import { NextResponse } from "next/server";
import { youtubeFetch } from "@/utils/youtubeApi";
import { cleanTitle } from "@/utils/text";
import { handleApiError } from "@/utils/apiResponse";
import { getAuthenticatedAccount } from "@/utils/userAccount";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_ARTISTS = 10;
const MAX_RELEASES = 12;
const RECENT_WINDOW_MS = 45 * 24 * 60 * 60 * 1000;
const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

function mapVideo(item, artist) {
  const id = item?.id?.videoId;
  if (!id || !YOUTUBE_ID_PATTERN.test(id)) return null;
  return {
    id,
    title: cleanTitle(item?.snippet?.title || ""),
    channel: cleanTitle(item?.snippet?.channelTitle || artist.name || ""),
    channelId: item?.snippet?.channelId || artist.channelId || "",
    publishedAt: item?.snippet?.publishedAt || "",
    thumbnail:
      item?.snippet?.thumbnails?.high?.url
      || item?.snippet?.thumbnails?.medium?.url
      || item?.snippet?.thumbnails?.default?.url
      || "",
    // Avatar of the followed channel, saved when the user followed (no extra API call).
    artistThumbnail: artist.thumbnail || "",
    seedQuery: artist.name || "",
    genre: artist.name || "",
  };
}

async function latestForArtist(artist) {
  const { ok, data } = await youtubeFetch("search", {
    part: "snippet",
    type: "video",
    channelId: artist.channelId,
    order: "date",
    maxResults: "2",
  });
  if (!ok) return [];
  return (Array.isArray(data?.items) ? data.items : [])
    .map((item) => mapVideo(item, artist))
    .filter(Boolean);
}

export async function GET(request) {
  try {
    const { userData } = await getAuthenticatedAccount(request);
    const meta = Array.isArray(userData.followedArtistsMeta) ? userData.followedArtistsMeta : [];
    const artists = meta
      .filter((item) => item?.channelId && /^UC[A-Za-z0-9_-]{20,24}$/.test(item.channelId))
      .slice(0, MAX_ARTISTS);

    if (artists.length === 0) {
      return NextResponse.json({ releases: [] });
    }

    const groups = await Promise.allSettled(artists.map((artist) => latestForArtist(artist)));
    const cutoff = Date.now() - RECENT_WINDOW_MS;
    const seen = new Set();
    const releases = [];
    for (const group of groups) {
      if (group.status !== "fulfilled") continue;
      for (const track of group.value) {
        if (seen.has(track.id)) continue;
        const published = track.publishedAt ? Date.parse(track.publishedAt) : NaN;
        if (!Number.isFinite(published) || published < cutoff) continue;
        seen.add(track.id);
        releases.push(track);
      }
    }
    releases.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));

    return NextResponse.json(
      { releases: releases.slice(0, MAX_RELEASES) },
      {
        headers: {
          "Cache-Control": "private, max-age=900",
        },
      },
    );
  } catch (e) {
    return handleApiError(e, "followed artist releases");
  }
}
