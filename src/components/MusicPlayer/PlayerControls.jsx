"use client";

import { Pause, Play, RotateCcw, RotateCw, SkipBack, SkipForward } from "lucide-react";

const skipButtonClass =
  "grid h-11 w-11 place-items-center rounded-full text-neutral-300 transition duration-150 hover:text-white active:scale-90 disabled:cursor-not-allowed disabled:text-neutral-600 disabled:active:scale-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00e6e6]";

/**
 * @typedef {Object} PlayerControlsProps
 * @property {boolean} isPlaying                       Whether playback is active.
 * @property {boolean} [hasPrevious]                   Disables Previous when false.
 * @property {boolean} [hasNext]                       Disables Next when false.
 * @property {() => void} onPrevious                   Previous handler (should honour the 3-second rule).
 * @property {() => void} onNext                       Next handler.
 * @property {() => void} onPlayPause                  Toggle play/pause.
 * @property {(seconds: number) => void} [onSeekRelative] When provided, renders the ±10s seek buttons.
 * @property {number} [seekStep]                       Seconds for the relative-seek buttons (default 10).
 * @property {string} [className]                      Extra classes for the wrapper.
 */

/**
 * Spotify / Apple Music-style transport cluster.
 *
 * @param {PlayerControlsProps} props
 */
export default function PlayerControls({
  isPlaying,
  hasPrevious = true,
  hasNext = true,
  onPrevious,
  onNext,
  onPlayPause,
  onSeekRelative,
  seekStep = 10,
  className = "",
}) {
  const canSeek = typeof onSeekRelative === "function";

  return (
    <div className={`flex items-center justify-center gap-2 sm:gap-4 ${className}`}>
      {canSeek && (
        <button
          type="button"
          onClick={() => onSeekRelative(-seekStep)}
          aria-label={`Rewind ${seekStep} seconds`}
          title={`Rewind ${seekStep}s`}
          className={skipButtonClass}
        >
          <RotateCcw size={20} aria-hidden="true" />
        </button>
      )}

      <button
        type="button"
        onClick={onPrevious}
        disabled={!hasPrevious}
        aria-label="Previous track"
        title="Previous"
        className={skipButtonClass}
      >
        <SkipBack size={22} aria-hidden="true" className="fill-current" />
      </button>

      <button
        type="button"
        onClick={onPlayPause}
        aria-label={isPlaying ? "Pause" : "Play"}
        title={isPlaying ? "Pause" : "Play"}
        className="grid h-14 w-14 place-items-center rounded-full bg-white text-black shadow-md transition duration-150 hover:scale-105 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00e6e6]"
      >
        {isPlaying ? (
          <Pause size={26} aria-hidden="true" className="fill-current" />
        ) : (
          <Play size={26} aria-hidden="true" className="translate-x-[1px] fill-current" />
        )}
      </button>

      <button
        type="button"
        onClick={onNext}
        disabled={!hasNext}
        aria-label="Next track"
        title="Next"
        className={skipButtonClass}
      >
        <SkipForward size={22} aria-hidden="true" className="fill-current" />
      </button>

      {canSeek && (
        <button
          type="button"
          onClick={() => onSeekRelative(seekStep)}
          aria-label={`Fast forward ${seekStep} seconds`}
          title={`Forward ${seekStep}s`}
          className={skipButtonClass}
        >
          <RotateCw size={20} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
