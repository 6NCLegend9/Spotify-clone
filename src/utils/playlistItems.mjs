import { dateMapForMembers, memberMapValue } from "./documentMutation.mjs";
import { durationMapForMembers } from "./playlistDuration.mjs";

export const MAX_PLAYLIST_ITEMS = 500;
export const PLAYLIST_TRACK_ID = /^[A-Za-z0-9_-]{11}$/;
export const PLAYLIST_ENTRY_ID = /^[A-Za-z0-9:_-]{1,128}$/;

function dateValue(value) {
  if (value == null) return null;
  if (!(value instanceof Date) && typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export function playlistRevision(playlist) {
  return Number.isSafeInteger(playlist?.__v) && playlist.__v >= 0 ? playlist.__v : 0;
}

// Read old records without writing/migrating them. If an older server has only
// changed songs, reject mismatched dual data and derive the current ordered list.
export function getPlaylistItems(playlist) {
  const songs = Array.isArray(playlist?.songs) ? playlist.songs : [];
  const items = playlist?.items;
  const entryIds = new Set();
  const aligned = Array.isArray(items) && items.length === songs.length && items.every((item, index) => {
    if (!item || typeof item.entryId !== "string" || typeof item.id !== "string"
        || !PLAYLIST_ENTRY_ID.test(item.entryId) || !PLAYLIST_TRACK_ID.test(item.id)
        || item.id !== songs[index] || entryIds.has(item.entryId)
        || (item.addedAt != null && !dateValue(item.addedAt))) return false;
    entryIds.add(item.entryId);
    return true;
  });
  if (aligned) return items.map((item) => ({ entryId: item.entryId, id: item.id, addedAt: dateValue(item.addedAt) }));
  const playlistId = String(playlist?._id || "unknown");
  return songs.map((id, index) => ({
    entryId: `legacy:${playlistId}:${index}:${id}`,
    id,
    addedAt: dateValue(memberMapValue(playlist?.songAddedAt, id)),
  }));
}

// Every mutation writes both representations together so installed older clients
// can continue using songs and per-content duration/date maps.
export function playlistItemChanges(playlist, items, durationId, duration) {
  const songs = items.map((item) => item.id);
  const songAddedAt = dateMapForMembers(songs, playlist?.songAddedAt);
  for (const item of items) {
    if (Object.hasOwn(songAddedAt, item.id) && !songAddedAt[item.id] && item.addedAt) {
      songAddedAt[item.id] = item.addedAt;
    }
  }
  return {
    items,
    songs,
    songAddedAt,
    songDurations: durationMapForMembers(songs, playlist?.songDurations, durationId, duration),
  };
}
