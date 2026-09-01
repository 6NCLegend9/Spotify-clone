import { createSlice } from "@reduxjs/toolkit";
import { EQ_PRESET_BANDS } from "@/utils/eqPresets";

export const EQ_PRESETS = [
  "Flat / Neutral", "Acoustic", "Bass Boost", "Bass Reducer", "Treble Boost", "Treble Reducer",
  "Vocal Booster", "Classical", "Dance", "Deep", "Electronic", "Hip-Hop", "Jazz", "Latin",
  "Loudness", "Lounge", "Piano", "Pop", "R&B", "Rock", "Small Speakers", "Spoken Word / Podcast",
  "Country", "Metal", "Ambient / Chill", "Custom",
];

const initialState = {
  transitionMode: "off",
  crossfadeSeconds: 0,
  eqPreset: "Flat / Neutral",
  eqBands: [0, 0, 0, 0, 0],
  dataSaver: false,
  audioOnly: false,
  videoQuality: "auto",
  wifiOnlyDownloads: false,
  streamingQuality: "auto",
  normalization: "normal",
  monoAudio: false,
  explicitContent: false,
  privateSession: false,
  tailoredAds: true,
  syncedLyrics: true,
  pictureInPicture: true,
  masterVolume: 0.85,
};

const settingsSlice = createSlice({
  name: "settings",
  initialState,
  reducers: {
    updateSetting: (state, action) => {
      const { key, value } = action.payload;
      if (key in state) state[key] = value;
      if (key === "eqPreset" && value !== "Custom" && EQ_PRESET_BANDS[value]) {
        state.eqBands = EQ_PRESET_BANDS[value];
      }
    },
    updateEqBands: (state, action) => {
      state.eqBands = action.payload;
      state.eqPreset = "Custom";
    },
    hydrateSettings: (state, action) => {
      const next = {
        ...state,
        ...action.payload,
        transitionMode: "off",
        crossfadeSeconds: 0,
      };
      if (next.eqPreset && next.eqPreset !== "Custom" && EQ_PRESET_BANDS[next.eqPreset]) {
        const bands = Array.isArray(next.eqBands) ? next.eqBands : [];
        if (bands.every((value) => !value)) next.eqBands = EQ_PRESET_BANDS[next.eqPreset];
      }
      return next;
    },
  },
});

export const { updateSetting, updateEqBands, hydrateSettings } = settingsSlice.actions;
export default settingsSlice.reducer;
