import { createSlice } from "@reduxjs/toolkit";
import { EQ_PRESET_BANDS, migrateEqBands } from "@/utils/eqPresets";
import { migrateLegacySettings } from "@/utils/settingsMigration.mjs";

export const EQ_PRESETS = [
  "Flat / Neutral", "Acoustic", "Bass Boost", "Bass Reducer", "Treble Boost", "Treble Reducer",
  "Vocal Booster", "Classical", "Dance", "Deep", "Electronic", "Hip-Hop", "Jazz", "Latin",
  "Loudness", "Lounge", "Piano", "Pop", "R&B", "Rock", "Small Speakers", "Spoken Word / Podcast",
  "Country", "Metal", "Ambient / Chill", "Custom",
];

const initialState = {
  eqPreset: "Flat / Neutral",
  eqBands: [0, 0, 0, 0, 0, 0],
  dataSaver: false,
  audioOnly: false,
  wifiOnlyDownloads: false,
  normalization: "normal",
  monoAudio: false,
  explicitContent: false,
  privateSession: false,
  listeningInsights: false,
  syncedLyrics: true,
  pictureInPicture: true,
  masterVolume: 1,
  keyboardShortcuts: true,
  captions: false,
  fadeEnabled: true,
  fadeSeconds: 0.8,
  discordPresence: false,
  discordPresenceConsent: false,
  browserNotifications: false,
  // Local-only monotonic token. It changes only after an explicit user action,
  // so a failed localhost/native connection stays quiet until the user retries.
  discordPresenceConnectRequest: 0,
  owner: null,
};

const settingsSlice = createSlice({
  name: "settings",
  initialState,
  reducers: {
    updateSetting: (state, action) => {
      const { key, value } = action.payload;
      if (key === "discordPresence") {
        const enabled = value === true;
        state.discordPresence = enabled;
        state.discordPresenceConsent = true;
        if (enabled) state.discordPresenceConnectRequest += 1;
        return;
      }
      if (key in initialState && key !== "owner" && key !== "discordPresenceConnectRequest") state[key] = value;
      if (key === "eqPreset" && value !== "Custom" && EQ_PRESET_BANDS[value]) {
        state.eqBands = EQ_PRESET_BANDS[value];
      }
    },
    requestDiscordPresenceConnect: (state) => {
      if (!state.discordPresence || !state.discordPresenceConsent) return;
      state.discordPresenceConnectRequest += 1;
    },
    updateEqBands: (state, action) => {
      state.eqBands = migrateEqBands(action.payload);
      state.eqPreset = "Custom";
    },
    setSettingsOwner: (state, action) => {
      if (state.owner === action.payload) return;
      return {
        ...initialState,
        owner: action.payload,
        masterVolume: state.masterVolume,
        keyboardShortcuts: state.keyboardShortcuts,
      };
    },
    hydrateSettings: (state, action) => {
      const payload = migrateLegacySettings(action.payload);
      const consent = payload.discordPresenceConsent === true || state.discordPresenceConsent === true;
      const requestedPresence = payload.discordPresence !== undefined
        ? payload.discordPresence === true
        : state.discordPresence === true;
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
        // Old accounts may have inherited the previous true-by-default value.
        // Do not treat that historical value as explicit permission.
        discordPresenceConsent: consent,
        discordPresence: consent && requestedPresence,
        discordPresenceConnectRequest: state.discordPresenceConnectRequest || 0,
        browserNotifications:
          typeof payload.browserNotifications === "boolean"
            ? payload.browserNotifications
            : state.browserNotifications === true,
      };
      next.eqBands = next.eqPreset && next.eqPreset !== "Custom" && EQ_PRESET_BANDS[next.eqPreset]
        ? EQ_PRESET_BANDS[next.eqPreset]
        : migrateEqBands(next.eqBands);
      return next;
    },
  },
});

export const {
  updateSetting,
  requestDiscordPresenceConnect,
  updateEqBands,
  hydrateSettings,
  setSettingsOwner,
} = settingsSlice.actions;
export default settingsSlice.reducer;
