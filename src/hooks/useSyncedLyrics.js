"use client";

import { useEffect, useMemo, useState } from "react";
import { activeLyricIndex } from "@/utils/lyricsLookup";

export default function useSyncedLyrics({ title, artist, duration, enabled = true }) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("idle");

  useEffect(() => {
    if (!enabled || !title) {
      setData(null);
      setStatus("idle");
      return undefined;
    }

    const controller = new AbortController();
    setStatus("loading");
    const params = new URLSearchParams({ title, artist: artist || "" });
    if (duration > 20) params.set("duration", String(Math.round(duration)));

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
  }, [title, artist, Math.round(duration || 0), enabled]);

  const lines = data?.lines || [];

  const indexFor = useMemo(
    () => (time) => activeLyricIndex(lines, time),
    [lines],
  );

  return { data, lines, status, indexFor, live: Boolean(data?.live) };
}
