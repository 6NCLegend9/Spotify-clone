export const FOLLOWED_RELEASE_ARTIST_LIMIT = 10;

function asArtist(name, channelId = "", thumbnail = "", followedAt = null) {
  return {
    name: typeof name === "string" ? name.trim() : "",
    channelId: typeof channelId === "string" ? channelId.trim() : "",
    thumbnail: typeof thumbnail === "string" ? thumbnail.trim() : "",
    followedAt: followedAt || null,
  };
}

export function followedArtistsForReleases(userData) {
  const byName = new Map();
  const names = Array.isArray(userData?.followedArtists) ? userData.followedArtists : [];
  for (const name of names) {
    if (typeof name !== "string" || !name.trim()) continue;
    const key = name.trim().toLowerCase();
    if (!byName.has(key)) byName.set(key, asArtist(name));
  }

  const meta = Array.isArray(userData?.followedArtistsMeta) ? userData.followedArtistsMeta : [];
  for (const item of meta) {
    const artist = asArtist(item?.name, item?.channelId, item?.thumbnail, item?.followedAt);
    if (!artist.name && !artist.channelId) continue;
    const key = (artist.name || artist.channelId).toLowerCase();
    const current = byName.get(key) || asArtist(artist.name);
    byName.set(key, {
      ...current,
      ...artist,
      name: artist.name || current.name,
      channelId: artist.channelId || current.channelId,
      thumbnail: artist.thumbnail || current.thumbnail,
      followedAt: artist.followedAt || current.followedAt,
    });
  }

  return [...byName.values()].slice(0, FOLLOWED_RELEASE_ARTIST_LIMIT);
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
