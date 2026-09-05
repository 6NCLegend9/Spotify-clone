"use client";

import { useCallback } from "react";

/**
 * @typedef {Object} PlayerTransportOptions
 * @property {number} currentTime               Current playback position, in seconds.
 * @property {number} duration                  Total track length, in seconds.
 * @property {boolean} [hasPrevious]            Whether a previous track exists in the queue.
 * @property {boolean} [hasNext]               Whether a next track exists in the queue.
 * @property {() => void} playPrevious          Skip to the previous track.
 * @property {() => void} playNext              Skip to the next track.
 * @property {(seconds: number) => void} seekTo Seek to an absolute position, in seconds.
 * @property {number} [restartThreshold]        Seconds before Previous restarts instead of skipping (default 3).
 */

/**
 * @typedef {Object} PlayerTransport
 * @property {() => void} handlePrevious              Previous with the Spotify/Apple "3-second rule".
 * @property {() => void} handleNext                 Skip to the next track.
 * @property {(seconds: number) => void} seekRelative Seek by a relative offset, clamped to [0, duration].
 */

/**
 * Smart transport controls that emulate Spotify / Apple Music behaviour.
 *
 * The "3-second rule": pressing Previous restarts the current track when we are
 * more than `restartThreshold` seconds in, otherwise it jumps to the previous
 * track. Next always advances immediately.
 *
 * @param {PlayerTransportOptions} options
 * @returns {PlayerTransport}
 */
export default function usePlayerTransport({
  currentTime,
  duration,
  hasPrevious = true,
  hasNext = true,
  playPrevious,
  playNext,
  seekTo,
  restartThreshold = 3,
}) {
  const seekRelative = useCallback(
    (seconds) => {
      if (typeof seekTo !== "function") return;
      const base = Number.isFinite(currentTime) ? currentTime : 0;
      // Only clamp against duration once we actually know it; otherwise allow the
      // underlying player to clamp so early key-presses still work.
      const upperBound = Number.isFinite(duration) && duration > 0 ? duration : Infinity;
      const target = Math.min(Math.max(0, base + seconds), upperBound);
      seekTo(target);
    },
    [currentTime, duration, seekTo],
  );

  const handlePrevious = useCallback(() => {
    if (Number.isFinite(currentTime) && currentTime > restartThreshold) {
      if (typeof seekTo === "function") seekTo(0);
      return;
    }
    if (hasPrevious && typeof playPrevious === "function") {
      playPrevious();
    } else if (typeof seekTo === "function") {
      // No previous track: fall back to restarting the current one.
      seekTo(0);
    }
  }, [currentTime, restartThreshold, hasPrevious, playPrevious, seekTo]);

  const handleNext = useCallback(() => {
    if (hasNext && typeof playNext === "function") playNext();
  }, [hasNext, playNext]);

  return { handlePrevious, handleNext, seekRelative };
}
