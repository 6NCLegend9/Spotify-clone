const PREFIX = "heykasa:playback:v1:";
const CURRENT_VERSION = 2;
const MAX_AGE = 30 * 86400000;
const MAX_BYTES = 300000;

function optionalText(value, maxLength) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : undefined;
}

function normalizeTrack(track) {
  if (typeof track?.id !== "string" || !/^[A-Za-z0-9_-]{11}$/.test(track.id)) return null;
  const normalized = {
    id: track.id,
    title: typeof track.title === "string" ? track.title.slice(0, 300) : "",
    channel: typeof track.channel === "string" ? track.channel.slice(0, 200) : "",
    thumbnail: `https://i.ytimg.com/vi/${track.id}/hqdefault.jpg`,
  };
  const seedQuery = optionalText(track.seedQuery, 200);
  const genre = optionalText(track.genre, 120);
  const channelId = optionalText(track.channelId, 120);
  if (seedQuery) normalized.seedQuery = seedQuery;
  if (genre) normalized.genre = genre;
  if (channelId) normalized.channelId = channelId;
  if (track.source === "youtube") normalized.source = "youtube";
  return normalized;
}

export function normalizePlaybackSnapshot(value) {
  const youtubeVideo = normalizeTrack(value?.youtubeVideo);
  const seen = new Set();
  const youtubeQueue = [];
  for (const entry of Array.isArray(value?.youtubeQueue) ? value.youtubeQueue : []) {
    const track = normalizeTrack(entry);
    if (!track || seen.has(track.id)) continue;
    seen.add(track.id);
    youtubeQueue.push(track);
    if (youtubeQueue.length === 200) break;
  }
  const position = youtubeVideo && Number.isFinite(value?.position)
    ? Math.min(86400, Math.max(0, value.position)) : 0;
  const queueManualEnd = typeof value?.queueManualEnd === "boolean"
    ? value.queueManualEnd
    : youtubeQueue.length > 1;
  return { youtubeVideo, youtubeQueue, position, queueManualEnd };
}

export function readPlaybackSnapshot(storage, owner, now = Date.now()) {
  if (!owner) return null;
  try {
    const raw = storage.getItem(`${PREFIX}${encodeURIComponent(owner)}`);
    if (!raw || raw.length > MAX_BYTES) return null;
    const snapshot = JSON.parse(raw);
    if (![1, CURRENT_VERSION].includes(snapshot?.version) || snapshot.owner !== owner
      || !Number.isFinite(snapshot.savedAt) || snapshot.savedAt > now
      || now - snapshot.savedAt > MAX_AGE) return null;
    return normalizePlaybackSnapshot(snapshot);
  } catch {
    return null;
  }
}

export function writePlaybackSnapshot(storage, owner, value, now = Date.now()) {
  if (!owner) return false;
  try {
    storage.setItem(`${PREFIX}${encodeURIComponent(owner)}`, JSON.stringify({
      version: CURRENT_VERSION,
      owner,
      savedAt: now,
      ...normalizePlaybackSnapshot(value),
    }));
    return true;
  } catch {
    return false;
  }
}