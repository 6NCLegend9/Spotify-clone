import { createSlice } from "@reduxjs/toolkit";
import { EQ_PRESET_BANDS } from "@/utils/eqPresets";

export const EQ_PRESETS = [
  "Flat / Neutral", "Acoustic", "Bass Boost", "Bass Reducer", "Treble Boost", "Treble Reducer",
  "Vocal Booster", "Classical", "Dance", "Deep", "Electronic", "Hip-Hop", "Jazz", "Latin",
  "Loudness", "Lounge", "Piano", "Pop", "R&B", "Rock", "Small Speakers", "Spoken Word / Podcast",
  "Country", "Metal", "Ambient / Chill", "Custom",
];

const initialState = {
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
  listeningInsights: false,
  syncedLyrics: true,
  pictureInPicture: true,
  masterVolume: 0.85,
  keyboardShortcuts: true,
  captions: false,
  fadeEnabled: true,
  fadeSeconds: 0.8,
  spatialAudio: false,
  discordPresence: true,
  owner: null,
};

const settingsSlice = createSlice({
  name: "settings",
  initialState,
  reducers: {
    updateSetting: (state, action) => {
      const { key, value } = action.payload;
      if (key === "captions") {
        state.captions = false;
        return;
      }
      if (key in initialState && key !== "owner") state[key] = value;
      if (key === "eqPreset" && value !== "Custom" && EQ_PRESET_BANDS[value]) {
        state.eqBands = EQ_PRESET_BANDS[value];
      }
    },
    updateEqBands: (state, action) => {
      state.eqBands = action.payload;
      state.eqPreset = "Custom";
    },
    setSettingsOwner: (state, action) => {
      if (state.owner === action.payload) return;
      return {
        ...initialState,
        owner: action.payload,
        masterVolume: state.masterVolume,
        keyboardShortcuts: state.keyboardShortcuts,
        captions: false,
      };
    },
    hydrateSettings: (state, action) => {
      const payload = action.payload || {};
      const next = {
        ...initialState,
        ...state,
        ...payload,
        owner: state.owner,
        transitionMode: "off",
        crossfadeSeconds: 0,
        keyboardShortcuts:
          payload.keyboardShortcuts !== undefined
            ? payload.keyboardShortcuts !== false
            : state.keyboardShortcuts !== false,
        captions: false,
      };
      if (next.eqPreset && next.eqPreset !== "Custom" && EQ_PRESET_BANDS[next.eqPreset]) {
        const bands = Array.isArray(next.eqBands) ? next.eqBands : [];
        if (bands.every((value) => !value)) next.eqBands = EQ_PRESET_BANDS[next.eqPreset];
      }
      return next;
    },
  },
});

export const { updateSetting, updateEqBands, hydrateSettings, setSettingsOwner } = settingsSlice.actions;
export default settingsSlice.reducer;
