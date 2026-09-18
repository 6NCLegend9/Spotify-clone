import { canonicalSongIdentity, canonicalSongTitle } from "./songIdentity.mjs";
import { buildOfficialMusicQuery, officialMusicScore, sanitizeMusicSearchQuery } from "./officialMusicSearch.mjs";

export const TRACK_CUTS = Object.freeze(["official", "live", "speed"]);
export const TRACK_CUT_STORAGE_KEY = "heykasa.trackCuts";

const CUT_LABELS = {
  official: "Official",
  live: "Live",
  speed: "Speed",
};

export function isTrackCut(value) {
  return TRACK_CUTS.includes(value);
}

export function trackCutLabel(cut) {
  return CUT_LABELS[cut] || CUT_LABELS.official;
}

export function classifyTrackCut(track) {
  const haystack = `${track?.title || ""} ${track?.channel || ""}`;
  if (/\b(?:sped\s*up|speed\s*up|nightcore)\b/i.test(haystack)) return "speed";
  if (/\b(?:live|concert|vevo\s+live|brings\s+out)\b/i.test(haystack)) return "live";
  return "official";
}

export function buildTrackCutQuery(track, cut) {
  const identity = canonicalSongIdentity(track);
  const title = canonicalSongTitle(track) || String(track?.title || "").trim();
  const artist = identity.includes("|")
    ? identity.slice(0, identity.indexOf("|"))
    : String(track?.channel || track?.artist || "").trim();
  const base = sanitizeMusicSearchQuery(`${artist} ${title}`.trim() || title);
  if (cut === "live") return `${base} live performance|official live`;
  if (cut === "speed") return `${base} sped up`;
  return buildOfficialMusicQuery(base);
}

export function scoreTrackCut(result, cut, query) {
  const title = String(result?.title || "");
  const haystack = `${title} ${result?.channel || ""}`;
  const isLive = /\b(?:live|concert|vevo\s+live|brings\s+out|performance)\b/i.test(haystack);
  const isSpeed = /\b(?:sped\s*up|speed\s*up|nightcore)\b/i.test(haystack);
  const isOfficialCue = /\b(?:official\s+(?:music\s+)?video|official\s+audio)\b/i.test(title);
  let score = officialMusicScore(result, query);
  if (cut === "live") {
    if (isLive) score += 250;
    else score -= 80;
    if (isSpeed) score -= 80;
    if (isOfficialCue && !isLive) score -= 120;
  } else if (cut === "speed") {
    if (isSpeed) score += 280;
    else score -= 80;
    if (isLive) score -= 60;
    if (isOfficialCue && !isSpeed) score -= 120;
  } else if (isLive || isSpeed) {
    score -= 80;
  }
  return score;
}

export function rankTrackCutResults(results, cut, query) {
  return (Array.isArray(results) ? results : [])
    .map((result, index) => ({ result, index, score: scoreTrackCut(result, cut, query) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ result }) => result);
}

export function readTrackCutPreferences(storage) {
  try {
    const raw = storage?.getItem?.(TRACK_CUT_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([key, value]) => key && isTrackCut(value))
        .slice(0, 400),
    );
  } catch {
    return {};
  }
}

export function writeTrackCutPreference(storage, identity, cut) {
  const key = String(identity || "").trim();
  if (!key || !isTrackCut(cut) || !storage?.setItem) return;
  const next = { ...readTrackCutPreferences(storage), [key]: cut };
  const keys = Object.keys(next);
  if (keys.length > 400) delete next[keys[0]];
  try {
    storage.setItem(TRACK_CUT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private browsing must not break playback.
  }
}

export function preferredTrackCut(track, storage) {
  const identity = canonicalSongIdentity(track);
  const stored = identity ? readTrackCutPreferences(storage)[identity] : "";
  return isTrackCut(stored) ? stored : classifyTrackCut(track);
}
