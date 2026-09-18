"use client";

import { useEffect, useState } from "react";
import { requestJson } from "@/services/http";
import { isYoutubeVideoId } from "@/utils/youtubeComments.mjs";

export default function useYoutubeCaptions(videoId, enabled = true) {
  const [lines, setLines] = useState([]);

  useEffect(() => {
    if (!enabled || !isYoutubeVideoId(videoId)) {
      setLines([]);
      return undefined;
    }
    const controller = new AbortController();
    requestJson(`/api/youtube-captions?videoId=${encodeURIComponent(videoId)}`, {
      signal: controller.signal,
      fallbackTitle: "Captions unavailable",
      fallbackMessage: "This video has no captions to highlight.",
    })
      .then((json) => {
        const next = Array.isArray(json?.lines) ? json.lines : Array.isArray(json?.data?.lines) ? json.data.lines : [];
        setLines(next.filter((line) => Number.isFinite(line?.time) && typeof line.text === "string"));
      })
      .catch(() => setLines([]));
    return () => controller.abort();
  }, [enabled, videoId]);

  return lines;
}
