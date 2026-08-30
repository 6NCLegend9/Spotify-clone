"use client";

import { useEffect, useMemo, useState } from "react";
import { activeLyricIndex } from "@/utils/lyricsLookup";

export default function useSyncedLyrics({ title, artist, duration, enabled = true }) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("idle");
  const roundedDuration = Math.round(duration || 0);

  useEffect(() => {
    if (!enabled || !title) {
      setData(null);
      setStatus("idle");
      return undefined;
    }

    const controller = new AbortController();
    setStatus("loading");
    const params = new URLSearchParams({ title, artist: artist || "" });
    if (roundedDuration > 20) params.set("duration", String(roundedDuration));

    fetch(`/api/lyrics?${params}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => {
        if (!json || json.error) {
          setData(null);
          setStatus("empty");
          return;
        }
        setData(json);
        setStatus(json.lines?.length || json.instrumental ? "ready" : "empty");
      })
      .catch((error) => {
        if (error.name === "AbortError") return;
        setData(null);
        setStatus("error");
      });

    return () => controller.abort();
  }, [artist, enabled, roundedDuration, title]);

  const lines = useMemo(() => data?.lines || [], [data?.lines]);

  const indexFor = useMemo(
    () => (time) => activeLyricIndex(lines, time),
    [lines],
  );

  return { data, lines, status, indexFor, live: Boolean(data?.live) };
}
