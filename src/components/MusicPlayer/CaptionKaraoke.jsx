"use client";

import { activeLyricIndex } from "@/utils/lyricsLookup";

export default function CaptionKaraoke({ currentTime = 0, enabled = true, lines = [] }) {
  if (!enabled || !Array.isArray(lines) || lines.length === 0) return null;
  const index = activeLyricIndex(lines, currentTime);
  const current = index >= 0 ? lines[index] : null;
  const upcoming = index >= 0 ? lines[index + 1] : lines[0];
  if (!current?.text) return null;

  return (
    <div className="caption-karaoke" aria-live="polite">
      <p className="caption-karaoke-now">{current.text}</p>
      {upcoming?.text ? <p className="caption-karaoke-next">{upcoming.text}</p> : null}
    </div>
  );
}
