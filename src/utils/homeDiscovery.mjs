import { canonicalSongIdentity } from "./songIdentity.mjs";

export const MAX_DISCOVERY_SEEN = 96;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export function discoverySeenIds(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter((id) => typeof id === "string" && VIDEO_ID.test(id)))].slice(-MAX_DISCOVERY_SEEN);
}

export function homeDiscoveryIds(sections) {
  return discoverySeenIds([
    ...(sections?.trending || []), ...(sections?.charts || []), ...(sections?.newReleases || []),
    ...(sections?.genres || []).flatMap((section) => section.videos || []),
  ].map((track) => track.id));
}

function score(id, rotation) {
  let hash = 2166136261;
  for (const char of `${rotation}:${id}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

// Re-rank a cached candidate pool, preserving novelty ahead of artist balance.
// Shared identities also prevent the same recording appearing in several rails.
export function selectHomeDiscovery(groups, { seenIds = [], rotation = 0 } = {}) {
  const seen = new Set(discoverySeenIds(seenIds));
  const ids = new Set();
  const identities = new Set();
  const artists = new Map();
  const candidates = groups.flat().filter((track) => {
    if (!track?.id || ids.has(track.id)) return false;
    const identity = canonicalSongIdentity(track);
    if (identity && identities.has(identity)) return false;
    ids.add(track.id);
    if (identity) identities.add(identity);
    return true;
  }).sort((a, b) => score(a.id, rotation) - score(b.id, rotation));
  const selected = [];
  while (candidates.length) {
    let best = 0;
    const priority = (track) => {
      const artist = String(track.channel || track.channelId || "").toLowerCase().replace(/\s*-\s*topic$|vevo$/g, "").trim();
      return { artist, seen: seen.has(track.id) ? 1 : 0, count: artists.get(artist) || 0 };
    };
    for (let index = 1; index < candidates.length; index += 1) {
      const current = priority(candidates[index]);
      const previous = priority(candidates[best]);
      if (current.seen < previous.seen || (current.seen === previous.seen && current.count < previous.count)) best = index;
    }
    const [track] = candidates.splice(best, 1);
    const { artist, count } = priority(track);
    artists.set(artist, count + 1);
    selected.push(track);
  }
  const recommendations = selected.slice(0, 24);
  // Groups can overlap, too: assign each remaining recording to just one row.
  const used = new Set(recommendations.map((track) => track.id));
  return {
    recommendations,
    genreVideos: groups.map((group) => {
      const members = new Set(group.map((track) => track.id));
      const videos = selected.filter((track) => !used.has(track.id) && members.has(track.id)).slice(0, 6);
      videos.forEach((track) => used.add(track.id));
      return videos;
    }),
  };
}
