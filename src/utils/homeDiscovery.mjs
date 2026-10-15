import { canonicalSongIdentity } from "./songIdentity.mjs";

export const MAX_DISCOVERY_SEEN = 96;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
export const MAX_DISCOVERY_PLAYLISTS_SEEN = 24;

export function discoveryPlaylistIds(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter((id) => typeof id === "string" && /^[A-Za-z0-9_-]{10,100}$/.test(id)))].slice(-MAX_DISCOVERY_PLAYLISTS_SEEN);
}

export function homeDiscoveryPlaylistIds(sections) {
  return discoveryPlaylistIds([...(sections?.forYou?.playlists || []), ...(sections?.explore?.playlists || []), ...(sections?.featuredPlaylists || [])].map((playlist) => playlist.id));
}

export function isNewDiscoveryArtist(track, artists) {
  const normalize = (value) => String(value || "").normalize("NFKD").toLowerCase().replace(/\s*-\s*topic$|vevo$/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const artist = canonicalSongIdentity(track).split("|")[0];
  return !artists.some((name) => normalize(name) === artist || normalize(name) === normalize(track.channel));
}

export function discoverySeenIds(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter((id) => typeof id === "string" && VIDEO_ID.test(id)))].slice(-MAX_DISCOVERY_SEEN);
}

export function homeDiscoveryIds(sections) {
  return discoverySeenIds([
    ...(sections?.forYou?.tracks || []), ...(sections?.explore?.tracks || []),
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
function rankDiscoveryTracks(groups, { seenIds = [], rotation = 0 } = {}) {
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
  return selected;
}

export function selectHomeDiscovery(groups, options = {}) {
  const selected = rankDiscoveryTracks(groups, options);
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

export function uniqueHomeTracks(tracks, excluded = []) {
  const ids = new Set(excluded.map((track) => String(track.id)));
  const identities = new Set(excluded.map(canonicalSongIdentity).filter(Boolean));
  return tracks.filter((track) => {
    if (!track?.id || ids.has(String(track.id))) return false;
    const identity = canonicalSongIdentity(track);
    if (identity && identities.has(identity)) return false;
    ids.add(String(track.id));
    if (identity) identities.add(identity);
    return true;
  });
}

export function uniqueHomePlaylists(playlists, excluded = []) {
  const ids = new Set(excluded.map((playlist) => playlist.id));
  const titles = new Set(excluded.map((playlist) => String(playlist.title || "").normalize("NFKC").trim().toLowerCase()).filter(Boolean));
  return playlists.filter((playlist) => {
    const title = String(playlist.title || "").normalize("NFKC").trim().toLowerCase();
    if (!playlist.id || ids.has(playlist.id) || (title && titles.has(title))) return false;
    ids.add(playlist.id);
    if (title) titles.add(title);
    return true;
  });
}

export function selectBalancedHomeDiscovery(familiarGroups, explorationGroups, options = {}) {
  const pools = [rankDiscoveryTracks(familiarGroups, options), rankDiscoveryTracks(explorationGroups, options)];
  const selected = [[], []];
  const used = [];
  for (let round = 0; round < 12; round += 1) {
    for (const side of [0, 1]) {
      const next = uniqueHomeTracks(pools[side], used)[0];
      if (!next) continue;
      selected[side].push(next);
      used.push(next);
    }
  }
  return { forYou: selected[0], explore: selected[1] };
}

export function selectHomePlaylists(familiar, exploration, { rotation = 0, seenPlaylistIds = [] } = {}) {
  const seen = new Set(discoveryPlaylistIds(seenPlaylistIds));
  const order = (values) => uniqueHomePlaylists(values).sort((a, b) => Number(seen.has(a.id)) - Number(seen.has(b.id)) || score(a.id, rotation) - score(b.id, rotation));
  const pools = [order(familiar), order(exploration)];
  const selected = [[], []], used = [];
  for (let round = 0; round < 4; round += 1) {
    for (const side of [0, 1]) {
      const next = uniqueHomePlaylists(pools[side], used)[0];
      if (next) { selected[side].push(next); used.push(next); }
    }
  }
  return { forYou: selected[0], explore: selected[1] };
}

export function composeHomePage({ status, history = [], playlists = [], releases = [], anniversary = [], weekly = [], forYou = {}, explore = {} }) {
  const recent = uniqueHomeTracks(history).map((track) => ({ ...track, title: track.title || track.name }));
  const library = [...new Map(playlists.map((playlist) => [String(playlist._id), playlist])).values()];
  const quickItems = [
    ...(status === "authenticated" ? [{ type: "liked", id: "liked" }] : []),
    ...library.map((playlist) => ({ type: "playlist", id: `pl-${playlist._id}`, playlist })),
  ].slice(0, 8);
  const quickTracks = recent.slice(0, 8 - quickItems.length);
  quickTracks.forEach((track, queueIndex) => quickItems.push({ ...track, type: "track", queue: quickTracks, queueIndex }));
  // Establish the recommendation split before inserting optional personal rows.
  // Memories must never take recordings already allocated to discovery.
  const baseTaste = uniqueHomeTracks(forYou.tracks || [], recent).slice(0, 12);
  const exploreTracks = uniqueHomeTracks(explore.tracks || [], [...recent, ...baseTaste]).slice(0, 12);
  const tasteCandidates = uniqueHomeTracks([
    ...releases.slice(0, 4).map((track) => ({ ...track, kicker: "New from an artist you follow" })),
    ...(forYou.tracks || []),
  ], [...recent, ...exploreTracks]);
  const memories = uniqueHomeTracks(anniversary, [...recent, ...exploreTracks]).slice(0, 3);
  const tasteTracks = uniqueHomeTracks([...memories, ...tasteCandidates], [...recent, ...exploreTracks]).slice(0, 12);
  const anniversaryIds = new Set(memories.map((track) => track.id));
  // A public weekly chart is not a personalization signal. Highlight matches in
  // the existing exploration selection without replacing its genres or artists.
  const weeklyRecordings = new Set(weekly.map(canonicalSongIdentity).filter(Boolean));
  const weeklyIds = new Set(exploreTracks.filter((track) => weeklyRecordings.has(canonicalSongIdentity(track))).slice(0, 3).map((track) => track.id));
  const tastePlaylists = uniqueHomePlaylists(forYou.playlists || []).slice(0, 4);
  const explorePlaylists = uniqueHomePlaylists(explore.playlists || [], tastePlaylists).slice(0, 4);
  return {
    quickItems,
    history: recent.slice(quickTracks.length, quickTracks.length + 8),
    anniversary: tasteTracks.filter((track) => anniversaryIds.has(track.id)),
    weekly: exploreTracks.filter((track) => weeklyIds.has(track.id)),
    forYou: { ...forYou, tracks: tasteTracks, mainTracks: tasteTracks.filter((track) => !anniversaryIds.has(track.id)), playlists: tastePlaylists },
    explore: { ...explore, tracks: exploreTracks, mainTracks: exploreTracks.filter((track) => !weeklyIds.has(track.id)), playlists: explorePlaylists },
  };
}
