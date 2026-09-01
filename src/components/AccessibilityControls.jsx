"use client";

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
  const { isReady, preferences, resetPreferences, updatePreference } =
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
            These preferences are saved only in this browser and apply across HeyKasa.
          </p>
        </div>
        <button
          type="button"
          className="btn-ghost h-9 self-start px-3 text-sm"
          onClick={resetPreferences}
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
              onChange={(event) => updatePreference(key, event.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-[#00e6e6]"
            />
            <span>
              <span className="block text-sm font-semibold text-white">{title}</span>
              <span className="mt-1 block text-sm leading-6 text-[#c9d4de]">{description}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <p className="mt-2 text-sm text-[#9aa8b5]" aria-live="polite">
        {isReady ? "Your choices take effect immediately." : "Loading your saved preferences."}
      </p>
    </section>
  );
}