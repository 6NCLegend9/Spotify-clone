import { isJamCode } from "./jam.mjs";

export const JAM_ROOM_PRESETS = ["Late night", "Study"];
export const JAM_NAME_MAX = 24;
export const JAM_SAVED_QUEUE_MAX = 40;
export const PERSISTENT_ROOM_TTL_MS = 400 * 24 * 60 * 60 * 1000;

export function normalizeJamRoomName(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, JAM_NAME_MAX);
}

export function jamRoomNameKey(value) {
  return normalizeJamRoomName(value).toLowerCase();
}

export function isJamRoomName(value) {
  const name = normalizeJamRoomName(value);
  return name.length >= 2 && name.length <= JAM_NAME_MAX;
}

export function persistentRoomExpiry(now = Date.now()) {
  return new Date(now + PERSISTENT_ROOM_TTL_MS);
}

export function sanitizeSavedTrack(track) {
  const id = String(track?.id || "").trim();
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
  return {
    id,
    title: String(track?.title || "").replace(/\s+/g, " ").trim().slice(0, 120),
    channel: String(track?.channel || "").replace(/\s+/g, " ").trim().slice(0, 80),
    thumbnail: /^https:\/\//i.test(String(track?.thumbnail || ""))
      ? String(track.thumbnail).slice(0, 500)
      : "",
    duration: Math.max(0, Math.min(86_400, Number(track?.duration) || 0)),
  };
}

export function sanitizeSavedQueue(queue) {
  if (!Array.isArray(queue)) return [];
  const seen = new Set();
  const tracks = [];
  for (const item of queue) {
    const track = sanitizeSavedTrack(item);
    if (!track || seen.has(track.id)) continue;
    seen.add(track.id);
    tracks.push(track);
    if (tracks.length >= JAM_SAVED_QUEUE_MAX) break;
  }
  return tracks;
}

export function sanitizeArcadeScore(payload = {}) {
  const score = Math.max(0, Math.min(9_999_999, Math.round(Number(payload.score) || 0)));
  const game = ["tiles", "runner", "invaders"].includes(payload.game) ? payload.game : "tiles";
  const name = String(payload.name || "Listener").replace(/\s+/g, " ").trim().slice(0, 40) || "Listener";
  const trackTitle = String(payload.trackTitle || "").replace(/\s+/g, " ").trim().slice(0, 80);
  return { score, game, name, trackTitle, at: Date.now() };
}

export function summarizePersistentRoom(room) {
  if (!room?.name || !isJamCode(room.code)) return null;
  return {
    name: room.name,
    code: room.code,
    closed: Boolean(room.closed),
    trackTitle: room.savedTrack?.title || "",
    songs: Array.isArray(room.savedQueue) ? room.savedQueue.length : 0,
  };
}
