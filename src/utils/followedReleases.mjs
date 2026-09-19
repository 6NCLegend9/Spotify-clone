import { fetchLatestChannelVideos, searchChannelsViaInnertube } from "@/utils/youtubeApi";
import { cleanTitle } from "@/utils/text";
import { FOLLOWED_RELEASE_ARTIST_LIMIT, collapseRelatedReleases, followedArtistsForReleases } from "./followedArtistsList.mjs";

export { FOLLOWED_RELEASE_ARTIST_LIMIT, collapseRelatedReleases, followedArtistsForReleases };
export const FOLLOWED_RELEASE_LIMIT = 12;
export const FOLLOWED_RELEASE_WINDOW_MS = 45 * 24 * 60 * 60 * 1000;
const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const CHANNEL_ID_PATTERN = /^UC[A-Za-z0-9_-]{20,24}$/;

async function resolveFollowedArtist(artist) {
  if (artist?.channelId && CHANNEL_ID_PATTERN.test(artist.channelId)) return artist;
  const query = artist?.name || "";
  if (!query) return null;
  const result = await searchChannelsViaInnertube(query, 1);
  const item = result?.ok ? result.data?.items?.[0] : null;
  const channelId = item?.id?.channelId || item?.snippet?.channelId || "";
  if (!CHANNEL_ID_PATTERN.test(channelId)) return null;
  return {
    ...artist,
    name: cleanTitle(item?.snippet?.title || query),
    channelId,
    thumbnail: item?.snippet?.thumbnails?.high?.url || artist.thumbnail || "",
  };
}

function toRelease(track, artist) {
  const id = track?.id;
  if (!id || !YOUTUBE_ID_PATTERN.test(id)) return null;
  return {
    id,
    title: cleanTitle(track.title || ""),
    channel: cleanTitle(track.channel || artist.name || ""),
    channelId: track.channelId || artist.channelId || "",
    publishedAt: track.publishedAt || "",
    thumbnail: track.thumbnail || "",
    artistThumbnail: artist.thumbnail || "",
    seedQuery: artist.name || "",
    genre: artist.name || "",
  };
}

async function latestForArtist(artist) {
  const resolved = await resolveFollowedArtist(artist);
  if (!resolved) return [];
  const tracks = await fetchLatestChannelVideos(resolved.channelId, {
    name: resolved.name || artist.name || "",
    maxResults: 2,
  });
  return tracks.map((track) => toRelease(track, resolved)).filter(Boolean);
}

export async function loadFollowedReleases(userData, now = Date.now()) {
  const artists = followedArtistsForReleases(userData);
  if (artists.length === 0) return [];

  const groups = await Promise.allSettled(artists.map((artist) => latestForArtist(artist)));
  const cutoff = now - FOLLOWED_RELEASE_WINDOW_MS;
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
  releases.sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt));
  return collapseRelatedReleases(releases).slice(0, FOLLOWED_RELEASE_LIMIT);
}
