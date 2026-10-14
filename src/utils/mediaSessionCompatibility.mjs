export function publishMediaMetadata(session, metadata, Metadata) {
  if (!session || typeof Metadata !== "function") return;
  try { session.metadata = new Metadata(metadata); } catch { /* Optional browser capability. */ }
}

export function publishMediaPlaybackState(session, playing) {
  if (!session) return;
  try { session.playbackState = playing ? "playing" : "paused"; } catch { /* Optional browser capability. */ }
}
