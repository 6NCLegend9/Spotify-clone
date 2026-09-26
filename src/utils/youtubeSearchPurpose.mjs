export const YOUTUBE_SEARCH_PURPOSES = Object.freeze([
  "interactive",
  "radio",
  "queue",
  "discovery",
]);

const PURPOSE_LIMITS = Object.freeze({
  interactive: Object.freeze({ windowMs: 60_000, max: 30 }),
  radio: Object.freeze({ windowMs: 60_000, max: 60 }),
  queue: Object.freeze({ windowMs: 60_000, max: 30 }),
  discovery: Object.freeze({ windowMs: 60_000, max: 36 }),
});

export function normalizeYoutubeSearchPurpose(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return YOUTUBE_SEARCH_PURPOSES.includes(normalized) ? normalized : "interactive";
}

export function youtubeSearchLimitFor(value) {
  const purpose = normalizeYoutubeSearchPurpose(value);
  return PURPOSE_LIMITS[purpose];
}
