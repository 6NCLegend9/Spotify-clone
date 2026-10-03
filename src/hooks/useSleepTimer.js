"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSleepTimer } from "@/utils/sleepTimer.mjs";

const STORAGE_KEY = "heykasa:sleep-timer:v1";

export default function useSleepTimer({ owner, trackId, enabled = true, onExpire } = {}) {
  const [timer, setTimer] = useState(null);
  const controllerRef = useRef(null);
  const onExpireRef = useRef(onExpire);

  useEffect(() => { onExpireRef.current = onExpire; }, [onExpire]);

  useEffect(() => {
    if (!enabled || !owner || typeof window === "undefined") {
      setTimer(null);
      if (!enabled && typeof window !== "undefined") {
        try {
          window.sessionStorage.removeItem(STORAGE_KEY);
        } catch {
          // Storage can be unavailable in hardened/private browser contexts.
        }
      }
      return undefined;
    }

    const controller = createSleepTimer({
      owner,
      storage: window.sessionStorage,
      onChange: setTimer,
      onExpire: () => onExpireRef.current?.(),
    });
    controllerRef.current = controller;

    const checkDeadline = () => controller.check();
    document.addEventListener("visibilitychange", checkDeadline);
    window.addEventListener("pageshow", checkDeadline);

    return () => {
      document.removeEventListener("visibilitychange", checkDeadline);
      window.removeEventListener("pageshow", checkDeadline);
      controller.dispose();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [enabled, owner]);

  useEffect(() => {
    if (enabled) controllerRef.current?.trackChanged(trackId);
  }, [enabled, trackId]);

  const change = useCallback((value) => {
    if (enabled) controllerRef.current?.start(value, trackId);
  }, [enabled, trackId]);

  const check = useCallback((endedTrackId) => (
    enabled && controllerRef.current?.check(endedTrackId) === true
  ), [enabled]);

  return { timer, change, check };
}
