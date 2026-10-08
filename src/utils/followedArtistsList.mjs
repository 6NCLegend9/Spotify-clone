import { ApiRouteError } from "./apiResponseCore.mjs";

export const FOLLOWED_RELEASE_ARTIST_LIMIT = 10;

function asArtist(name, channelId = "", thumbnail = "", followedAt = null) {
  return {
    name: typeof name === "string" ? name.trim() : "",
    channelId: typeof channelId === "string" ? channelId.trim() : "",
    thumbnail: typeof thumbnail === "string" ? thumbnail.trim() : "",
    followedAt: followedAt || null,
  };
}

export function followedArtistKey(artist) {
  return artist.channelId ? `channel:${artist.channelId}` : `name:${artist.name.toLowerCase()}`;
}

// Channel metadata is authoritative; names remain descriptive recommendation
// seeds and a compatibility path for records saved before channel IDs existed.
export function followedArtistsForDisplay(userData) {
  const artists = new Map();
  const meta = Array.isArray(userData?.followedArtistsMeta) ? userData.followedArtistsMeta : [];
  for (const item of meta) {
    const artist = asArtist(item?.name, item?.channelId, item?.thumbnail, item?.followedAt);
    if (artist.name || artist.channelId) artists.set(followedArtistKey(artist), artist);
  }
  const names = Array.isArray(userData?.followedArtists) ? userData.followedArtists : [];
  for (const name of names) {
    const artist = asArtist(name);
    if (artist.name && ![...artists.values()].some(item => item.name.toLowerCase() === artist.name.toLowerCase())) {
      artists.set(followedArtistKey(artist), artist);
    }
  }
  return [...artists.values()];
}

export function isArtistFollowed(userData, artist) {
  return followedArtistsForDisplay(userData).some(item => artist.channelId
    ? item.channelId === artist.channelId || (!item.channelId && item.name.toLowerCase() === artist.name.toLowerCase())
    : item.name.toLowerCase() === artist.name.toLowerCase());
}

export function updateArtistMembership(userData, artist, followed, limit = 100) {
  const items = followedArtistsForDisplay(userData);
  const matches = items.filter(item => artist.channelId
    ? item.channelId === artist.channelId || (!item.channelId && item.name.toLowerCase() === artist.name.toLowerCase())
    : item.name.toLowerCase() === artist.name.toLowerCase());
  if (!artist.channelId && matches.length > 1) throw new ApiRouteError("VALIDATION_ERROR", { message: "A channel ID is required to update this artist." });
  const existing = matches.find(item => item.channelId === artist.channelId) || matches[0];
  let next = items.filter(item => !matches.includes(item));
  if (followed) {
    if (!existing && items.length >= limit) throw new ApiRouteError("VALIDATION_ERROR", { message: `You can follow up to ${limit} artists.` });
    const updated = {
      ...artist,
      channelId: artist.channelId || existing?.channelId || "",
      thumbnail: artist.thumbnail || existing?.thumbnail || "",
      followedAt: existing?.followedAt || new Date(),
    };
    if (existing) next.splice(Math.min(items.indexOf(existing), next.length), 0, updated);
    else next.push(updated);
  }
  const names = new Map(next.filter(item => item.name).map(item => [item.name.toLowerCase(), item.name]));
  return { followedArtists: [...names.values()], followedArtistsMeta: next };
}

export function followedArtistsForReleases(userData) {
  return followedArtistsForDisplay(userData).slice(0, FOLLOWED_RELEASE_ARTIST_LIMIT);
}

function relatedReleaseKey(release) {
  const title = String(release?.title || "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/\b(feat|ft)\b.*$/g, " ")
    .replace(/\b(official|music|video|audio|lyrics|visualizer|hd|4k)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return `${String(release?.channelId || release?.channel || "").toLowerCase()}:${title}`;
}

export function collapseRelatedReleases(releases) {
  if (!Array.isArray(releases)) return [];
  const seen = new Set();
  const items = [];
  for (const release of releases) {
    const key = relatedReleaseKey(release);
    if (!key.endsWith(":") && seen.has(key)) continue;
    if (!key.endsWith(":")) seen.add(key);
    items.push(release);
  }
  return items;
}
