"use client";

import { useEffect, useState } from "react";
import { TrackRail } from "./HomeRail";
import { requestJson } from "@/services/http";
import { hydrateYouTubeTracks } from "@/services/libraryApi";

export default function WeekOnKasa() {
  const [videos, setVideos] = useState([]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    requestJson("/api/week-on-kasa", {
      signal: controller.signal,
      fallbackTitle: "This week on Kasa is unavailable",
      fallbackMessage: "We couldn’t load this week’s listening pulse.",
    })
      .then(async (response) => {
        const ids = (response?.tracks || []).map((track) => track?.id);
        const hydrated = await hydrateYouTubeTracks(ids).catch(() => []);
        if (active) setVideos(hydrated);
      })
      .catch(() => {
        if (active) setVideos([]);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  return <TrackRail title="This week on Kasa" videos={videos} />;
}
