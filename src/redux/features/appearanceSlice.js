import { createSlice } from "@reduxjs/toolkit";
import {
  DEFAULT_APPEARANCE_ACCENT,
  effectiveAppearance,
} from "@/utils/appearanceModel.mjs";

const initialState = {
  available: false,
  loaded: false,
  activeProfileId: "",
  profiles: [],
  activeProfile: null,
  backgroundUrl: "",
  warning: null,
  resolvedAccent: DEFAULT_APPEARANCE_ACCENT,
  accentForeground: "#001014",
  preview: null,
};

const appearanceSlice = createSlice({
  name: "appearance",
  initialState,
  reducers: {
    hydrateAppearance: (state, action) => {
      const payload = action.payload && typeof action.payload === "object" ? action.payload : {};
      state.available = true;
      state.loaded = true;
      state.activeProfileId = typeof payload.activeProfileId === "string" ? payload.activeProfileId : "";
      state.profiles = Array.isArray(payload.profiles) ? payload.profiles : [];
      state.activeProfile = payload.activeProfile && typeof payload.activeProfile === "object"
        ? payload.activeProfile
        : null;
      state.backgroundUrl = typeof payload.backgroundUrl === "string" ? payload.backgroundUrl : "";
      state.warning = payload.warning && typeof payload.warning === "object" ? payload.warning : null;
      state.resolvedAccent = /^#[0-9a-f]{6}$/i.test(payload.resolvedAccent || "")
        ? payload.resolvedAccent
        : DEFAULT_APPEARANCE_ACCENT;
      state.accentForeground = /^#[0-9a-f]{6}$/i.test(payload.accentForeground || "")
        ? payload.accentForeground
        : "#001014";
      state.preview = null;
    },
    markAppearanceUnavailable: (state) => {
      Object.assign(state, initialState, { loaded: true });
    },
    previewAppearance: (state, action) => {
      const payload = action.payload && typeof action.payload === "object" ? action.payload : null;
      state.preview = payload;
    },
    clearAppearancePreview: (state) => {
      state.preview = null;
    },
  },
});

export function selectEffectiveAppearance(state) {
  return effectiveAppearance(state.appearance || initialState);
}

export function selectResolvedAccent(state) {
  return effectiveAppearance(state.appearance || initialState).resolvedAccent;
}

export function selectAccentForeground(state) {
  return effectiveAppearance(state.appearance || initialState).accentForeground;
}

export const {
  hydrateAppearance,
  markAppearanceUnavailable,
  previewAppearance,
  clearAppearancePreview,
} = appearanceSlice.actions;

export default appearanceSlice.reducer;
