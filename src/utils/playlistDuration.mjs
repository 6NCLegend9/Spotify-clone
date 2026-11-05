import { isSafeMemberMapKey, memberMapValue } from "./documentMutation.mjs";

export function knownDuration(value) {
  if (typeof value !== "number") return 0;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 1 && seconds <= 86400 ? Math.floor(seconds) : 0;
}

export function durationMapForMembers(members, previous, id, duration) {
  return Object.fromEntries(members.filter(isSafeMemberMapKey).flatMap((key) => {
    const seconds = knownDuration(key === id ? duration : 0) || knownDuration(memberMapValue(previous, key));
    return seconds ? [[key, seconds]] : [];
  }));
}

export function withSavedDurations(tracks, durations) {
  return tracks.map((track) => {
    const saved = memberMapValue(durations, track.id);
    return { ...track, duration: knownDuration(track.duration) || knownDuration(saved) };
  });
}

export function playlistDurationLabel(tracks) {
  const seconds = tracks.reduce((sum, track) => sum + knownDuration(track.duration), 0);
  if (!seconds) return tracks.length ? "Duration unavailable" : "";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  const label = hours ? `${hours} hr ${minutes} min` : seconds < 60 ? `${seconds} sec` : `${minutes} min`;
  return tracks.some((track) => !knownDuration(track.duration)) ? `At least ${label}` : label;
}
