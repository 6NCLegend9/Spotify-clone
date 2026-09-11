"use client";

import { useEffect, useRef } from "react";
import { createListeningObservation } from "@/utils/listeningInsights.mjs";

export default function useListeningInsights({ owner, trackId, enabled, getSample }) {
  const latest = useRef({ owner, enabled, trackId, getSample });
  latest.current = { owner, enabled, trackId, getSample };
  const finishRef = useRef(() => {});
  useEffect(() => {
    if (!enabled || !owner?.startsWith("account:") || !/^[A-Za-z0-9_-]{11}$/.test(trackId || "")) return;
    let observation = null;
    const sample = () => {
      if (latest.current.trackId !== trackId || latest.current.owner !== owner || !latest.current.enabled) return;
      let value;
      try { value = latest.current.getSample(); } catch { return; }
      if (!value) return;
      if (!observation && value.playing) {
        observation = createListeningObservation({ id: trackId, eventId: crypto.randomUUID() });
      }
      observation?.sample(value.position, value.playing);
    };
    const finish = (event) => {
      if (!latest.current.enabled || latest.current.owner !== owner) { observation = null; return; }
      sample();
      const body = observation?.finish(event);
      observation = null;
      if (!body || body.listenedSeconds < 1) return;
      void fetch("/api/playEvent", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, owner }), keepalive: true,
      }).catch(() => {});
    };
    finishRef.current = finish;
    const onHide = () => finish("stopped");
    const interval = setInterval(sample, 1000);
    sample();
    window.addEventListener("pagehide", onHide);
    return () => {
      clearInterval(interval);
      window.removeEventListener("pagehide", onHide);
      finish("skipped");
      finishRef.current = () => {};
    };
  }, [owner, trackId, enabled]);
  return { finish: (event) => finishRef.current(event) };
}