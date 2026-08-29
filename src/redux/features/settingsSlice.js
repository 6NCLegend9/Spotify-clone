import { createSlice } from "@reduxjs/toolkit";

export const EQ_PRESETS = [
  "Flat / Neutral", "Acoustic", "Bass Boost", "Bass Reducer", "Treble Boost", "Treble Reducer",
  "Vocal Booster", "Classical", "Dance", "Deep", "Electronic", "Hip-Hop", "Jazz", "Latin",
  "Loudness", "Lounge", "Piano", "Pop", "R&B", "Rock", "Small Speakers", "Spoken Word / Podcast",
  "Country", "Metal", "Ambient / Chill", "Custom",
];

const initialState = {
  transitionMode: "automix",
  crossfadeSeconds: 6,
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
};

const settingsSlice = createSlice({
  name: "settings",
  initialState,
  reducers: {
    updateSetting: (state, action) => {
      const { key, value } = action.payload;
      if (key in state) state[key] = value;
    },
    updateEqBands: (state, action) => {
      state.eqBands = action.payload;
      state.eqPreset = "Custom";
    },
    hydrateSettings: (state, action) => ({ ...state, ...action.payload }),
  },
});

export const { updateSetting, updateEqBands, hydrateSettings } = settingsSlice.actions;
export default settingsSlice.reducer;
