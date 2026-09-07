"use client";

import { useEffect, useRef } from "react";

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
  const sentinelRef = useRef(null);
  const activeRef = useRef(active);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    if (!enabled || !hasWakeLock()) return undefined;
    let disposed = false;

    const acquire = async () => {
      if (disposed || !activeRef.current) return;
      try {
        sentinelRef.current = await navigator.wakeLock.request("screen");
        sentinelRef.current.addEventListener("release", () => {
          sentinelRef.current = null;
        });
      } catch {
        // Denied or unsupported; playback continues without a wake lock.
      }
    };

    const release = async () => {
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      if (sentinel) {
        try {
          await sentinel.release();
        } catch {
          // Already released.
        }
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible" && activeRef.current) void acquire();
    };

    if (activeRef.current) void acquire();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void release();
    };
  }, [enabled, active]);
}
