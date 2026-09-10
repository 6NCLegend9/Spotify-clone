"use client";

import { useEffect } from "react";
import { createScreenWakeLock } from "../utils/screenWakeLock.mjs";

function hasWakeLock() {
  return typeof navigator !== "undefined" && "wakeLock" in navigator;
}

/**
 * Keep the screen on while audio plays so a music listener's display doesn't
 * sleep mid-track. The lock auto-releases when the page hides (an OS rule, not
 * optional) and is re-acquired on return if playback is still active.
 *
 * @param {boolean} active  True while the player is playing.
 * @param {boolean} [enabled]  Master switch (default true).
 */
export default function useWakeLock(active, enabled = true) {
  useEffect(() => {
    if (!active || !enabled || !hasWakeLock()) return undefined;
    const lock = createScreenWakeLock(
      navigator.wakeLock,
      () => document.visibilityState === "visible",
    );

    const onVisibility = () => {
      void lock.acquire();
    };

    void lock.acquire();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      lock.dispose();
    };
  }, [enabled, active]);
}
