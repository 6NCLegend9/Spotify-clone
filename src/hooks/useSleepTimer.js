"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSleepTimer } from "@/utils/sleepTimer.mjs";

export default function useSleepTimer({ owner, trackId, enabled = true, onExpire } = {}) {
  const [timer, setTimer] = useState(null);
  const controllerRef = useRef(null);
  const onExpireRef = useRef(onExpire);

  useEffect(() => { onExpireRef.current = onExpire; }, [onExpire]);

  useEffect(() => {
    if (!enabled || !owner || typeof window === "undefined") {
      setTimer(null);
      return undefined;
    }
    const controller = createSleepTimer({
      owner,
      storage: window.sessionStorage,
      onChange: setTimer,
      onExpire: () => onExpireRef.current?.(),
    });
    controllerRef.current = controller;
    return () => {
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
