"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { TrackRail } from "./HomeRail";
import { getFavouriteLibrary, hydrateYouTubeTracks } from "@/services/libraryApi";
import { likedOnThisDay } from "@/utils/thisDayOnKasa.mjs";

export default function ThisDayOnKasa() {
  const { status } = useSession();
  const [videos, setVideos] = useState([]);

  useEffect(() => {
    if (status !== "authenticated") {
      setVideos([]);
      return undefined;
    }
    let active = true;
    getFavouriteLibrary()
      .then(async (library) => {
        const liked = likedOnThisDay(library?.favouriteAddedAt);
        const hydrated = await hydrateYouTubeTracks(liked.map((item) => item.id)).catch(() => []);
        if (!active) return;
        const yearById = new Map(liked.map((item) => [item.id, item.year]));
        setVideos(hydrated.map((track) => ({
          ...track,
          kicker: yearById.has(track.id) ? `Liked in ${yearById.get(track.id)}` : "",
        })));
      })
      .catch(() => {
        if (active) setVideos([]);
      });
    return () => {
      active = false;
    };
  }, [status]);

  if (status !== "authenticated") return null;
  return <TrackRail title="This day on Kasa" videos={videos} />;
}
