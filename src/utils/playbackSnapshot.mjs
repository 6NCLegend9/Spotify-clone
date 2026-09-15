const PREFIX = "heykasa:playback:v1:";
const CURRENT_VERSION = 3;
const MAX_AGE = 30 * 86400000;
const MAX_BYTES = 400000;

function optionalText(value, maxLength) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : undefined;
}

function normalizeContext(value) {
  if (!value || typeof value !== "object") return null;
  const type = optionalText(value.type, 40);
  const id = optionalText(value.id, 160);
  const name = optionalText(value.name, 160);
  if (!type && !id && !name) return null;
  return { type: type || "unknown", ...(id ? { id } : {}), ...(name ? { name } : {}) };
}

function normalizeTrack(track, fallbackEntryId) {
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
  const queueEntryId = optionalText(track.queueEntryId, 220) || fallbackEntryId;
  if (seedQuery) normalized.seedQuery = seedQuery;
  if (genre) normalized.genre = genre;
  if (channelId) normalized.channelId = channelId;
  if (track.source === "youtube") normalized.source = "youtube";
  if (queueEntryId) normalized.queueEntryId = queueEntryId;
  if (track.queueSource === "user") normalized.queueSource = "user";
  else if (track.queueSource === "context") normalized.queueSource = "context";
  return normalized;
}

function normalizeQueue(value) {
  const seenEntries = new Set();
  const queue = [];
  const source = Array.isArray(value) ? value : [];
  for (let index = 0; index < source.length; index += 1) {
    const raw = source[index];
    const fallbackEntryId = raw?.id ? `legacy:${index}:${raw.id}` : undefined;
    const track = normalizeTrack(raw, fallbackEntryId);
    if (!track) continue;
    const identity = track.queueEntryId || `${index}:${track.id}`;
    if (seenEntries.has(identity)) continue;
    seenEntries.add(identity);
    queue.push(track);
    if (queue.length === 200) break;
  }
  return queue;
}

export function normalizePlaybackSnapshot(value) {
  const youtubeQueue = normalizeQueue(value?.youtubeQueue);
  const rawVideo = normalizeTrack(value?.youtubeVideo, value?.youtubeVideo?.id ? `current:${value.youtubeVideo.id}` : undefined);
  const youtubeVideo = rawVideo
    ? youtubeQueue.find((item) => item.queueEntryId && item.queueEntryId === rawVideo.queueEntryId)
      || youtubeQueue.find((item) => item.id === rawVideo.id)
      || rawVideo
    : null;
  const position = youtubeVideo && Number.isFinite(value?.position)
    ? Math.min(86400, Math.max(0, value.position)) : 0;
  const queueMode = value?.queueMode === "collection" || value?.queueMode === "radio"
    ? value.queueMode
    : typeof value?.queueManualEnd === "boolean"
      ? (value.queueManualEnd ? "collection" : "radio")
      : youtubeQueue.length > 1 ? "collection" : "radio";
  const userQueue = normalizeQueue(
    Array.isArray(value?.userQueue)
      ? value.userQueue
      : youtubeQueue.filter((item) => item.queueSource === "user"),
  ).map((item) => ({ ...item, queueSource: "user" }));
  const history = normalizeQueue(value?.history).slice(-50);
  const playbackContext = normalizeContext(value?.playbackContext);
  const queueSequence = Number.isFinite(value?.queueSequence)
    ? Math.max(0, Math.floor(value.queueSequence))
    : youtubeQueue.length + history.length + userQueue.length;
  return {
    youtubeVideo,
    youtubeQueue,
    position,
    queueMode,
    queueManualEnd: queueMode === "collection",
    playbackContext,
    userQueue,
    history,
    queueSequence,
  };
}

export function readPlaybackSnapshot(storage, owner, now = Date.now()) {
  if (!owner) return null;
  try {
    const raw = storage.getItem(`${PREFIX}${encodeURIComponent(owner)}`);
    if (!raw || raw.length > MAX_BYTES) return null;
    const snapshot = JSON.parse(raw);
    if (![1, 2, CURRENT_VERSION].includes(snapshot?.version) || snapshot.owner !== owner
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
