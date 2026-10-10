"use client";

import { formatDuration, formatElapsedTime } from "@/utils/trackDuration.mjs";
import type { CSSProperties } from "react";
import styles from "./playerTimeline.module.css";

export const formatPlayerTime = formatElapsedTime;

export default function PlayerTimeline({ position, duration, disabled, onSeek }: {
  position: number; duration: number; disabled?: boolean; onSeek: (position: number) => void;
}) {
  const maximum = Number.isFinite(duration) ? Math.max(0, duration) : 0;
  const current = Number.isFinite(position) ? Math.min(maximum, Math.max(0, position)) : 0;
  const progressStyle = { "--seek-progress": `${maximum > 0 ? (current / maximum) * 100 : 0}%` } as CSSProperties;
  return (
    <div className={styles.timeline}>
      <span className={styles.time}>{formatPlayerTime(position)}</span>
      <input aria-label="Song progress" aria-valuetext={`${formatPlayerTime(current)} of ${formatDuration(maximum)}`}
        type="range" min={0} max={maximum} step={1} value={current} disabled={disabled || maximum === 0}
        onChange={(event) => onSeek(Number(event.target.value))}
        className={styles.range} style={progressStyle} />
      <span className={styles.time}>{formatDuration(maximum)}</span>
    </div>
  );
}
