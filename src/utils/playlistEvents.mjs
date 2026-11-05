import { accountStorageGeneration, canWriteAccountCache, getActiveAccountOwner } from "./accountStorage.mjs";
import { canEditPlaylist } from "./playlistAccess.mjs";

export const PLAYLISTS_CHANGED_EVENT = "heykasa:playlists-changed";

// Call after checking the request's captured account scope. Never broadcast a
// late response into a different login or a cleared account generation.
export function notifyPlaylistChanged({ owner, playlist, deletedId } = {}) {
  if (typeof window === "undefined" || !owner?.startsWith("account:")
    || getActiveAccountOwner() !== owner || !canWriteAccountCache(owner)) return false;
  window.dispatchEvent(new CustomEvent(PLAYLISTS_CHANGED_EVENT, {
    detail: { owner, generation: accountStorageGeneration(), playlist, deletedId },
  }));
  return true;
}

export function isCurrentPlaylistEvent(event, scope) {
  if (!scope.isCurrent()) return false;
  const detail = event.detail;
  return (!detail?.owner || detail.owner === scope.owner)
    && (detail?.generation === undefined || detail.generation === accountStorageGeneration());
}

// An unsaved public playlist leaves the library; ownership and collaboration
// still keep their playlists visible. Merge canonical fields without losing
// details when a legacy consumer broadcasts only a partial update.
export function applyPlaylistChange(current, { playlist, deletedId } = {}, owner) {
  if (deletedId) return current.filter((item) => String(item._id) !== String(deletedId));
  if (!playlist?._id) return current;
  const previous = current.find((item) => String(item._id) === String(playlist._id));
  const updated = { ...previous, ...playlist };
  const rest = current.filter((item) => String(item._id) !== String(playlist._id));
  const userId = owner?.startsWith("account:") ? owner.slice("account:".length) : "";
  if (updated.liked === false && !canEditPlaylist(updated, userId)) return rest;
  return updated.name ? [updated, ...rest] : current;
}
