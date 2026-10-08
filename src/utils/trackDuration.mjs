export function formatDuration(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return "—";
  const total = Math.floor(value);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total / 60) % 60;
  const remainder = String(total % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${remainder}` : `${minutes}:${remainder}`;
}

// Only duration is borrowed: catalog identities, credits and order remain intact.
export function withKnownDurations(tracks, knownTracks) {
  const known = new Map();
  for (const track of knownTracks || []) {
    const value = Number(track?.duration);
    if (track?.id && Number.isFinite(value) && value > 0 && !known.has(track.id)) known.set(track.id, value);
  }
  return tracks.map(track => {
    const value = Number(track.duration);
    return Number.isFinite(value) && value > 0 || !known.has(track.id) ? track : { ...track, duration: known.get(track.id) };
  });
}

export function formatElapsedTime(seconds) {
  const value = Number(seconds);
  return Number.isFinite(value) && value > 0 ? formatDuration(value) : "0:00";
}
