export const HISTORY_LIMIT = 100;
export const HISTORY_CHANGED = "heykasa:history-changed";
export const HISTORY_CACHE = "heykasa:history:v1";

export function recentTracks(values) {
  const seen = new Set();
  return (Array.isArray(values) ? values : []).filter((track) => {
    if (!track || !track.id || !(track.title || track.name) || seen.has(String(track.id))) return false;
    seen.add(String(track.id)); return true;
  }).slice(0, HISTORY_LIMIT);
}

export function prependHistory(values, entry) {
  return recentTracks([entry, ...(Array.isArray(values) ? values : [])]);
}

export function removeSearchTerm(values, term) {
  const key = String(term).trim().toLocaleLowerCase();
  return (Array.isArray(values) ? values : []).filter((value) => typeof value === "string" && value.trim().toLocaleLowerCase() !== key);
}
