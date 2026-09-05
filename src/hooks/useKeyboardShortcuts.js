"use client";

import { useEffect, useRef } from "react";

const INTERACTIVE_SELECTOR =
  "button, a, [role='button'], [role='link'], [role='menuitem'], [role='option'], [role='tab'], [role='switch'], summary";

/** True when the event target is a text field the user is editing. */
function isEditableTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/** True when the target is a focusable control that owns the Space key. */
function isInteractiveTarget(target) {
  return target instanceof HTMLElement && Boolean(target.closest(INTERACTIVE_SELECTOR));
}

/**
 * @typedef {Object} KeyboardShortcutOptions
 * @property {boolean} [enabled]                        Master switch (default true).
 * @property {() => void} [onTogglePlay]                Space.
 * @property {() => void} [onPrevious]                  Alt + ArrowLeft.
 * @property {() => void} [onNext]                      Alt + ArrowRight.
 * @property {(seconds: number) => void} [onSeekRelative] ArrowLeft / ArrowRight (no Alt).
 * @property {() => void} [onToggleMute]               M.
 * @property {number} [seekStep]                        Seconds for arrow-key seeking (default 5).
 */

/**
 * Global keyboard shortcuts for the player.
 *
 * - Space: play / pause
 * - Alt + Left / Right: previous / next track
 * - Left / Right: seek by `seekStep` seconds
 * - M: mute / unmute
 *
 * Safety rule: shortcut listeners are bypassed while the user is typing in an
 * `<input>`, `<textarea>`, `<select>`, or `contenteditable` element. Space is
 * additionally ignored while a button/link is focused so it activates that
 * control instead. Handlers are read from a ref so callers need not memoize.
 *
 * @param {KeyboardShortcutOptions} [options]
 */
export default function useKeyboardShortcuts(options = {}) {
  const { enabled = true } = options;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return undefined;

    const handleKeyDown = (event) => {
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey) return; // Leave OS/browser combos alone.
      if (isEditableTarget(event.target)) return; // Never hijack typing.

      const { onTogglePlay, onPrevious, onNext, onSeekRelative, onToggleMute, seekStep = 5 } =
        optionsRef.current;

      const { key } = event;

      if (key === " " || event.code === "Space") {
        if (isInteractiveTarget(event.target)) return; // Let the focused control handle Space.
        if (typeof onTogglePlay === "function") {
          event.preventDefault();
          onTogglePlay();
        }
        return;
      }

      if (key === "ArrowLeft") {
        if (event.altKey) {
          if (typeof onPrevious === "function") {
            event.preventDefault();
            onPrevious();
          }
        } else if (typeof onSeekRelative === "function") {
          event.preventDefault();
          onSeekRelative(-seekStep);
        }
        return;
      }

      if (key === "ArrowRight") {
        if (event.altKey) {
          if (typeof onNext === "function") {
            event.preventDefault();
            onNext();
          }
        } else if (typeof onSeekRelative === "function") {
          event.preventDefault();
          onSeekRelative(seekStep);
        }
        return;
      }

      if ((key === "m" || key === "M") && !event.altKey) {
        if (typeof onToggleMute === "function") {
          event.preventDefault();
          onToggleMute();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled]);
}
