const RETIRED_SETTINGS = new Set([
  "streamingQuality",
  "videoQuality",
  "spatialAudio",
]);

export function migrateLegacySettings(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const next = {};
  for (const [key, value] of Object.entries(input)) {
    if (RETIRED_SETTINGS.has(key)) continue;
    next[key] = value;
  }
  if (input.videoQuality === "audio-only") next.audioOnly = true;
  return next;
}

export { RETIRED_SETTINGS };
