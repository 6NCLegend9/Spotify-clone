"use client";

import { TRACK_CUTS, trackCutLabel } from "@/utils/trackCut.mjs";
import useTrackCut from "@/hooks/useTrackCut";

export default function TrackCutPicker({ disabled = false }) {
  const { currentCut, busy, selectCut, available } = useTrackCut();
  if (!available) return null;

  return (
    <div className="mt-3" role="group" aria-label="Pick the cut">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#9aa8b5]">Pick the cut</p>
      <div className="flex rounded-full border border-white/15 p-1">
        {TRACK_CUTS.map((cut) => {
          const selected = currentCut === cut;
          return (
            <button
              key={cut}
              type="button"
              aria-pressed={selected}
              disabled={disabled || Boolean(busy)}
              onClick={() => void selectCut(cut)}
              className={`min-h-11 flex-1 rounded-full px-2 text-xs font-semibold transition ${
                selected
                  ? "bg-[#00e6e6] text-black"
                  : "text-gray-200 hover:bg-white/10"
              } disabled:cursor-wait disabled:opacity-50`}
            >
              {busy === cut ? "Finding…" : trackCutLabel(cut)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
