"use client";

export function formatPlayerTime(value: number) {
  const seconds = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function PlayerTimeline({ position, duration, disabled, onSeek }: {
  position: number; duration: number; disabled?: boolean; onSeek: (position: number) => void;
}) {
  const maximum = Number.isFinite(duration) ? Math.max(0, duration) : 0;
  const current = Number.isFinite(position) ? Math.min(maximum, Math.max(0, position)) : 0;
  return (
    <div className="flex w-full min-w-0 items-center gap-2 text-xs tabular-nums text-[var(--muted)]">
      <span className="w-10 shrink-0 text-right">{formatPlayerTime(position)}</span>
      <input aria-label="Song progress" aria-valuetext={`${formatPlayerTime(current)} of ${formatPlayerTime(maximum)}`}
        type="range" min={0} max={maximum} step={1} value={current} disabled={disabled || maximum === 0}
        onChange={(event) => onSeek(Number(event.target.value))}
        className="h-12 min-w-12 flex-1 cursor-pointer accent-[var(--accent)] disabled:cursor-default" />
      <span className="w-10 shrink-0">{formatPlayerTime(maximum)}</span>
    </div>
  );
}