"use client";

import { useEffect } from "react";
import { createScreenWakeLock } from "../utils/screenWakeLock.mjs";

function hasWakeLock() {
  return typeof navigator !== "undefined" && "wakeLock" in navigator;
}

/**
 * Keep the screen on only while a caller has an active visual-media reason.
 * The lock auto-releases when the page hides and is re-acquired on return while
 * that visual-media condition remains active.
 *
 * @param {boolean} active  True while a visible media surface needs the display awake.
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
