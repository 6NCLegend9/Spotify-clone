export const EQ_BAND_FREQS = [60, 150, 400, 1000, 2400, 15000];
const LEGACY_EQ_BAND_FREQS = [60, 230, 910, 3600, 14000];
const FLAT_BANDS = [0, 0, 0, 0, 0, 0];
const LEGACY_EQ_PRESET_BANDS = {
  "Flat / Neutral": [0, 0, 0, 0, 0], Acoustic: [4, 2, 1, 2, 3],
  "Bass Boost": [8, 5, 0, -1, 0], "Bass Reducer": [-6, -4, 0, 1, 1],
  "Treble Boost": [0, -1, 1, 5, 7], "Treble Reducer": [1, 1, 0, -4, -6],
  "Vocal Booster": [-2, 1, 5, 4, 1], Classical: [4, 3, -1, 2, 4],
  Dance: [6, 3, 0, 4, 5], Deep: [7, 4, 1, -2, -3],
  Electronic: [5, 2, -1, 3, 6], "Hip-Hop": [7, 4, 0, 1, 3],
  Jazz: [3, 2, 1, 3, 4], Latin: [5, 2, 0, 3, 5],
  Loudness: [6, 3, 0, 3, 6], Lounge: [-1, 2, 4, 2, 0],
  Piano: [2, 3, 1, 2, 3], Pop: [2, 4, 5, 3, 2],
  "R&B": [6, 3, 1, 2, 4], Rock: [5, 3, -1, 3, 5],
  "Small Speakers": [-6, 2, 5, 3, -3], "Spoken Word / Podcast": [-4, -1, 5, 3, -2],
  Country: [3, 2, 0, 3, 4], Metal: [6, 1, -2, 3, 5], "Ambient / Chill": [3, 2, 1, 1, 2],
};
const clampGain = (value) => Math.max(-12, Math.min(12, Number(value) || 0));
export function migrateEqBands(bands) {
  if (!Array.isArray(bands)) return [...FLAT_BANDS];
  if (bands.length === EQ_BAND_FREQS.length) return bands.map(clampGain);
  if (bands.length !== LEGACY_EQ_BAND_FREQS.length) return [...FLAT_BANDS];
  return EQ_BAND_FREQS.map((frequency) => {
    if (frequency <= LEGACY_EQ_BAND_FREQS[0]) return clampGain(bands[0]);
    const last = LEGACY_EQ_BAND_FREQS.length - 1;
    if (frequency >= LEGACY_EQ_BAND_FREQS[last]) return clampGain(bands[last]);
    const upper = LEGACY_EQ_BAND_FREQS.findIndex((candidate) => candidate >= frequency);
    const lower = upper - 1;
    const start = Math.log(LEGACY_EQ_BAND_FREQS[lower]);
    const end = Math.log(LEGACY_EQ_BAND_FREQS[upper]);
    const ratio = (Math.log(frequency) - start) / (end - start);
    return Number((clampGain(bands[lower]) + (clampGain(bands[upper]) - clampGain(bands[lower])) * ratio).toFixed(2));
  });
}
export const EQ_PRESET_BANDS = Object.fromEntries(Object.entries(LEGACY_EQ_PRESET_BANDS).map(([name, bands]) => [name, migrateEqBands(bands)]));
export function bandsForPreset(preset, customBands = FLAT_BANDS) {
  if (preset === "Custom") return migrateEqBands(customBands);
  return EQ_PRESET_BANDS[preset] || migrateEqBands(customBands);
}
export function normalizationGain(mode) {
  if (mode === "quiet") return 0.72;
  if (mode === "loud") return 1.08;
  return 1;
}
export function eqLoudnessGain(bands = []) {
  const avg = bands.reduce((sum, value) => sum + Number(value || 0), 0) / Math.max(bands.length, 1);
  return Math.min(1.18, Math.max(0.55, 1 + avg / 28));
}
export function youtubePlaybackVolume(bands, mode) {
  // YouTube's cross-origin IFrame audio cannot be processed by HayKasa's
  // Web Audio EQ graph. Preserve the legacy signature, but never fake EQ by
  // changing the whole-track volume when a user moves frequency bands.
  void bands;
  return Math.round(Math.min(100, Math.max(8, 100 * normalizationGain(mode))));
}
