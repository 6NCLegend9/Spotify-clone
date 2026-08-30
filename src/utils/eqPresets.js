export const EQ_BAND_FREQS = [60, 230, 910, 3600, 14000];

export const EQ_PRESET_BANDS = {
  "Flat / Neutral": [0, 0, 0, 0, 0],
  Acoustic: [4, 2, 1, 2, 3],
  "Bass Boost": [8, 5, 0, -1, 0],
  "Bass Reducer": [-6, -4, 0, 1, 1],
  "Treble Boost": [0, -1, 1, 5, 7],
  "Treble Reducer": [1, 1, 0, -4, -6],
  "Vocal Booster": [-2, 1, 5, 4, 1],
  Classical: [4, 2, -1, 3, 4],
  Dance: [6, 3, 0, 2, 4],
  Deep: [5, 3, 1, -2, -3],
  Electronic: [5, 2, -1, 3, 5],
  "Hip-Hop": [7, 4, 0, 2, 3],
  Jazz: [3, 1, 0, 2, 3],
  Latin: [4, 2, 0, 2, 4],
  Loudness: [6, 0, -2, 0, 5],
  Lounge: [2, 1, 0, 1, 2],
  Piano: [1, 2, 3, 3, 2],
  Pop: [2, 1, 0, 2, 4],
  "R&B": [6, 3, -1, 2, 3],
  Rock: [5, 2, -1, 2, 5],
  "Small Speakers": [5, 3, 1, 2, 3],
  "Spoken Word / Podcast": [-2, 3, 5, 4, 1],
  Country: [3, 2, 0, 2, 3],
  Metal: [6, 1, -2, 3, 5],
  "Ambient / Chill": [3, 2, 1, 1, 2],
};

export function bandsForPreset(preset, customBands = [0, 0, 0, 0, 0]) {
  if (preset === "Custom") return customBands;
  return EQ_PRESET_BANDS[preset] || customBands;
}

export function normalizationGain(mode) {
  if (mode === "quiet") return 0.72;
  if (mode === "loud") return 1.08;
  return 0.92;
}

export function eqLoudnessGain(bands = []) {
  const avg = bands.reduce((sum, value) => sum + Number(value || 0), 0) / Math.max(bands.length, 1);
  return Math.min(1.18, Math.max(0.55, 1 + avg / 28));
}

export function youtubePlaybackVolume(bands, mode) {
  return Math.round(
    Math.min(100, Math.max(8, 100 * eqLoudnessGain(bands) * normalizationGain(mode))),
  );
}
