"use client";

import { Moon } from "lucide-react";

function timerValue(timer) {
  if (timer?.mode === "track") return "track";
  if (timer?.mode === "minutes") return String(timer.minutes);
  return "off";
}

export default function SleepTimerControl({ timer, onChange, disabled = false }) {
  return (
    <label className="inline-flex min-h-11 items-center gap-2 text-xs font-medium text-[var(--teal)]">
      <Moon size={16} aria-hidden="true" />
      <span className="sr-only">Sleep timer</span>
      <select aria-label="Sleep timer" value={timerValue(timer)} disabled={disabled}
        onChange={(event) => onChange?.(event.target.value)}
        className="min-h-11 rounded-md border border-white/15 bg-[var(--navy-deep)] px-2 text-xs text-[var(--text)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/30 disabled:cursor-not-allowed disabled:opacity-50">
        <option value="off">Timer off</option>
        <option value="track">End of track</option>
        <option value="15">15 minutes</option>
        <option value="30">30 minutes</option>
        <option value="60">60 minutes</option>
      </select>
    </label>
  );
}
