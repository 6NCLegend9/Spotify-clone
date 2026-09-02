"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { requestJson } from "@/services/http";
import { toUserError } from "@/utils/userError";
import { activeLyricIndex } from "@/utils/lyricsLookup";

export default function useSyncedLyrics({ title, artist, duration, enabled = true }) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);
  const [requestVersion, setRequestVersion] = useState(0);
  const roundedDuration = Math.round(duration || 0);
  const retry = useCallback(() => setRequestVersion((version) => version + 1), []);

  useEffect(() => {
    if (!enabled || !title) {
      setData(null);
      setStatus("idle");
      setError(null);
      return undefined;
    }

    const controller = new AbortController();
    setStatus("loading");
    setError(null);
    const params = new URLSearchParams({ title, artist: artist || "" });
    if (roundedDuration > 20) params.set("duration", String(roundedDuration));

    requestJson(`/api/lyrics?${params}`, {
      signal: controller.signal,
      fallbackTitle: "Lyrics unavailable",
      fallbackMessage: "We couldn’t load lyrics for this track. Please try again.",
    })
      .then((json) => {
        if (controller.signal.aborted) return;
        if (!json || typeof json !== "object" || json.error) {
          setData(null);
          setError(toUserError(json, {
            title: "Lyrics unavailable",
            message: "We couldn’t load lyrics for this track. Please try again.",
          }));
          setStatus("error");
          return;
        }
        if (!json.lines?.length && !json.instrumental) {
          setData(null);
          setStatus("empty");
          return;
        }
        setData(json);
        setStatus("ready");
      })
      .catch((requestError) => {
        if (controller.signal.aborted) return;
        setData(null);
        setError(toUserError(requestError, {
          title: "Lyrics unavailable",
          message: "We couldn’t load lyrics for this track. Please try again.",
        }));
        setStatus("error");
      });

    return () => controller.abort();
  }, [artist, enabled, requestVersion, roundedDuration, title]);

  const lines = useMemo(() => data?.lines || [], [data?.lines]);

  const indexFor = useMemo(
    () => (time) => activeLyricIndex(lines, time),
    [lines],
  );

  return {
    data,
    error,
    lines,
    status,
    indexFor,
    live: Boolean(data?.live),
    retry,
  };
}
