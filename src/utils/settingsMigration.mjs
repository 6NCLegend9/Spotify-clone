export const SUPPORTED_USER_SETTING_KEYS = Object.freeze([
  "eqPreset",
  "eqBands",
  "dataSaver",
  "audioOnly",
  "wifiOnlyDownloads",
  "normalization",
  "monoAudio",
  "explicitContent",
  "privateSession",
  "listeningInsights",
  "syncedLyrics",
  "pictureInPicture",
  "masterVolume",
  "keyboardShortcuts",
  "captions",
  "fadeEnabled",
  "fadeSeconds",
  "discordPresence",
  "discordPresenceConsent",
  "browserNotifications",
]);

const INTERNAL_PERSISTED_SETTING_KEYS = Object.freeze([
  "owner",
  "discordPresenceConnectRequest",
  "_persist",
]);

const SUPPORTED_PERSISTED_SETTING_KEYS = new Set([
  ...SUPPORTED_USER_SETTING_KEYS,
  ...INTERNAL_PERSISTED_SETTING_KEYS,
]);

export function migrateLegacySettings(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};

  const next = {};
  for (const key of SUPPORTED_PERSISTED_SETTING_KEYS) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      next[key] = input[key];
    }
  }

  // Legacy accounts used videoQuality="audio-only" as the only audio-focused
  // signal. Preserve that preference once while dropping the retired field.
  if (input.videoQuality === "audio-only") next.audioOnly = true;

  return next;
}
