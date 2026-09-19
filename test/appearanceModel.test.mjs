import assert from "node:assert/strict";
import test from "node:test";
import { effectiveAppearance } from "../src/utils/appearanceModel.mjs";

const savedProfile = {
  id: "night",
  name: "Night",
  home: { visible: false, message: "", size: "medium", align: "left" },
  accent: { mode: "fixed", fixedColor: "#00e6e6" },
};

test("appearance preview overrides saved values without mutating them", () => {
  const state = {
    activeProfile: savedProfile,
    backgroundUrl: "",
    resolvedAccent: "#00e6e6",
    accentForeground: "#001014",
    preview: {
      profile: {
        ...savedProfile,
        home: { ...savedProfile.home, visible: true, message: "Evening coding" },
      },
      backgroundUrl: "heykasa-media://background/123e4567-e89b-42d3-a456-426614174000",
      resolvedAccent: "#ff7755",
      accentForeground: "#001014",
    },
  };

  const preview = effectiveAppearance(state);
  assert.equal(preview.activeProfile.home.message, "Evening coding");
  assert.equal(preview.resolvedAccent, "#ff7755");
  assert.match(preview.backgroundUrl, /^heykasa-media:/);
  assert.equal(state.activeProfile.home.message, "");
});

test("accent strings stay comparable when only the preview color changes", () => {
  const base = {
    activeProfile: savedProfile,
    backgroundUrl: "",
    resolvedAccent: "#00e6e6",
    accentForeground: "#001014",
  };
  const first = effectiveAppearance({
    ...base,
    preview: { resolvedAccent: "#6b5cff", accentForeground: "#ffffff" },
  });
  const second = effectiveAppearance({
    ...base,
    preview: { resolvedAccent: "#6b5cff", accentForeground: "#ffffff" },
  });
  assert.equal(first.resolvedAccent, second.resolvedAccent);
  assert.equal(first.accentForeground, second.accentForeground);
});

test("cleared preview returns the saved appearance", () => {
  const saved = {
    activeProfile: savedProfile,
    backgroundUrl: "",
    resolvedAccent: "#00e6e6",
    accentForeground: "#001014",
    preview: null,
  };
  assert.equal(effectiveAppearance(saved), saved);
  assert.equal(effectiveAppearance(saved).activeProfile.home.message, "");
});
