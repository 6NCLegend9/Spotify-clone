import { isYoutubeVideoId } from "./youtubeComments.mjs";

export const MAX_PULSE_TRACKS = 40;
export const PUBLIC_PULSE_LIMIT = 12;

export function utcWeekKey(now = new Date()) {
  const utc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function sanitizePulseTracks(tracks) {
  const playsById = new Map();
  for (const track of Array.isArray(tracks) ? tracks : []) {
    const id = String(track?.id || "").trim();
    if (!isYoutubeVideoId(id)) continue;
    const plays = Math.max(0, Math.min(1_000_000_000, Math.floor(Number(track.plays) || 0)));
    playsById.set(id, (playsById.get(id) || 0) + plays);
  }
  return [...playsById.entries()]
    .map(([id, plays]) => ({ id, plays }))
    .sort((first, second) => second.plays - first.plays || first.id.localeCompare(second.id))
    .slice(0, MAX_PULSE_TRACKS);
}

export function recordPulsePlay(tracks, videoId) {
  const current = sanitizePulseTracks(tracks);
  const id = String(videoId || "").trim();
  if (!isYoutubeVideoId(id)) return current;
  return sanitizePulseTracks([...current, { id, plays: 1 }]);
}

export function publicPulseTracks(tracks, limit = PUBLIC_PULSE_LIMIT) {
  const cap = Math.min(PUBLIC_PULSE_LIMIT, Math.max(0, Math.floor(Number(limit) || 0)));
  return sanitizePulseTracks(tracks).slice(0, cap).map(({ id }) => ({ id }));
}

export function shouldRecordWeekPulse(observation, settings) {
  return Boolean(
    observation?.event === "completed"
    && isYoutubeVideoId(observation.id)
    && settings?.listeningInsights === true
    && settings?.privateSession !== true
  );
}
