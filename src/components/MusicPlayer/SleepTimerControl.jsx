"use client";

import { Timer } from "lucide-react";

export default function SleepTimerControl({ timer, onChange, disabled }) {
  const value = timer?.mode === "track" ? "track" : timer ? String(timer.minutes) : "off";
  return <div className="min-w-0 border-t border-[var(--hairline)] pt-3">
    <label className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--text)]">
      <span className="flex items-center gap-2"><Timer size={18} aria-hidden="true" />Sleep timer</span>
      <select aria-label="Sleep timer" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="min-h-12 min-w-0 max-w-full rounded border border-[var(--hairline)] bg-[var(--navy-surface)] px-3 text-sm">
        <option value="off">Off</option><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="60">60 minutes</option><option value="track">End of track</option>
      </select>
    </label>
    {timer && <p role="status" className="mt-2 text-xs text-[var(--muted)]">{timer.mode === "track" ? "Stops after this track" : `Stops at ${new Date(timer.deadline).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}</p>}
  </div>;
}