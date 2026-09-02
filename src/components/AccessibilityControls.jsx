"use client";

import { useState } from "react";
import { useAccessibilityPreferences } from "@/components/AccessibilityPreferences";

const preferencesList = [
  {
    key: "largeText",
    title: "Larger text",
    description: "Increase the base text size throughout HeyKasa.",
  },
  {
    key: "highContrast",
    title: "High contrast",
    description: "Use stronger text, border, and surface contrast.",
  },
  {
    key: "reducedMotion",
    title: "Reduce motion",
    description: "Stop non-essential animations and transitions in this browser.",
  },
];

export default function AccessibilityControls() {
  const [announcement, setAnnouncement] = useState("");
  const {
    isReady,
    preferences,
    resetPreferences,
    storageStatus,
    updatePreference,
  } =
    useAccessibilityPreferences();

  return (
    <section
      className="mt-8 border border-white/15 bg-white/[0.04] p-5 sm:p-6"
      aria-labelledby="display-preferences"
    >
      <div className="flex flex-col gap-2 border-b border-white/10 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="display-preferences" className="text-xl font-bold">
            Display preferences
          </h2>
          <p className="mt-1 text-sm leading-6 text-[#c9d4de]">
            These preferences apply across HeyKasa and are saved in this browser when storage is
            available.
          </p>
        </div>
        <button
          type="button"
          className="btn-ghost h-9 self-start px-3 text-sm"
          onClick={() => {
            resetPreferences();
            setAnnouncement("Display preferences restored to their defaults.");
          }}
          disabled={!isReady}
        >
          Restore defaults
        </button>
      </div>

      <fieldset className="mt-2 divide-y divide-white/10" disabled={!isReady}>
        <legend className="sr-only">Accessibility display preferences</legend>
        {preferencesList.map(({ key, title, description }) => (
          <label key={key} className="flex cursor-pointer items-start gap-4 py-5">
            <input
              type="checkbox"
              checked={preferences[key]}
              onChange={(event) => {
                const enabled = event.target.checked;
                updatePreference(key, enabled);
                setAnnouncement(`${title} ${enabled ? "enabled" : "disabled"}.`);
              }}
              className="mt-0.5 h-5 w-5 shrink-0 accent-[#00e6e6]"
            />
            <span>
              <span className="block text-sm font-semibold text-white">{title}</span>
              <span className="mt-1 block text-sm leading-6 text-[#c9d4de]">{description}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <p
        className="mt-2 text-sm text-[#9aa8b5]"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {!isReady
          ? "Loading your saved preferences."
          : storageStatus === "unavailable"
            ? `${announcement} Changes apply now, but this browser can’t save them between visits.`.trim()
            : announcement || "Preferences loaded. Changes take effect immediately."}
      </p>
    </section>
  );
}