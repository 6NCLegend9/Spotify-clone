// YouTube does not reliably label every track. Apply the same metadata policy
// to discovery and playback; unlabelled explicit lyrics cannot be detected here.
export function isExplicitTrack(track) {
  if (!track || typeof track !== "object") return false;
  if (track.explicit === true || track.explicitContent === true || track.isExplicit === true) return true;
  return /\bexplicit\b|\buncensored\b|\b18\s*\+/i.test(
    [track.title, track.name, track.description].filter((value) => typeof value === "string").join(" "),
  );
}

export function isTrackAllowed(track, allowExplicit = false) {
  return allowExplicit === true || !isExplicitTrack(track);
}

// Enforce the device's current preference for every playback entry point,
// including restored queues, playlists, Jam updates and direct track actions.
export function applyExplicitContentPolicy(player, allowExplicit) {
  if (!player || allowExplicit === true) return player;
  let next = player;
  for (const key of ["youtubeQueue", "userQueue", "currentSongs"]) {
    const tracks = player[key];
    if (!Array.isArray(tracks) || tracks.every((track) => isTrackAllowed(track))) continue;
    if (next === player) next = { ...player };
    next[key] = tracks.filter((track) => isTrackAllowed(track));
    if (key === "currentSongs") {
      next.currentIndex = Math.max(0, next[key].findIndex((track) => track?.id === player.activeSong?.id));
    }
  }
  if (!isTrackAllowed(player.youtubeVideo) || !isTrackAllowed(player.activeSong)) {
    next = { ...next, youtubeVideo: null, activeSong: {}, isActive: false, isPlaying: false,
      position: 0, restorePosition: null, queueUndo: null };
  }
  if (next.isPlaying && !next.youtubeVideo?.id && !next.activeSong?.id) {
    next = { ...next, isPlaying: false };
  }
  return next;
}
