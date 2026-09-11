"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSleepTimer } from "@/utils/sleepTimer.mjs";

export default function useSleepTimer({ owner, trackId, enabled = true, onExpire }) {
  const [timer, setTimer] = useState(null);
  const controller = useRef(null);
  const expire = useRef(onExpire);
  expire.current = onExpire;
  useEffect(() => {
    let storage;
    try { storage = sessionStorage; } catch {}
    if (!enabled || !owner) {
      if (!enabled) {
        try { storage?.removeItem("heykasa:sleep-timer:v1"); } catch {}
      }
      setTimer(null);
      return;
    }
    const current = createSleepTimer({ owner, storage, onChange: setTimer, onExpire: () => expire.current() });
    controller.current = current;
    const check = () => { current.check(); };
    document.addEventListener("visibilitychange", check);
    window.addEventListener("pageshow", check);
    return () => {
      current.dispose();
      controller.current = null;
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("pageshow", check);
    };
  }, [owner, enabled]);
  useEffect(() => { controller.current?.trackChanged(trackId); }, [trackId, owner, enabled]);
  const check = useCallback((endedId) => controller.current?.check(endedId) || false, []);
  return {
    timer,
    change: (value) => controller.current?.start(value, trackId),
    check,
  };
}