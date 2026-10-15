"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useSelector } from "react-redux";
import { requestJson } from "@/services/http";
import { getFavouriteLibrary, hydrateYouTubeTracks } from "@/services/libraryApi";
import { accountOwner } from "@/utils/accountCache.mjs";
import { isTrackAllowed } from "@/utils/explicitContent.mjs";
import { likedOnThisDay } from "@/utils/thisDayOnKasa.mjs";

export default function useHomeHighlights(refreshing) {
  const { data: session, status } = useSession();
  const owner = accountOwner(session, status);
  const privateSession = useSelector((state) => state.settings.privateSession);
  const allowExplicit = useSelector((state) => state.settings.explicitContent === true);
  const [snapshot, setSnapshot] = useState(null);

  useEffect(() => {
    if (!owner || refreshing) return undefined;
    const controller = new AbortController();
    let cancelled = false;
    const loadAnniversary = async () => {
      if (owner === "guest" || privateSession) return [];
      const library = await getFavouriteLibrary();
      if (cancelled) return [];
      const liked = likedOnThisDay(library.favouriteAddedAt);
      const tracks = await hydrateYouTubeTracks(liked.map((item) => item.id));
      const years = new Map(liked.map((item) => [item.id, item.year]));
      return tracks.filter((track) => years.has(track.id)).map((track) => ({ ...track, kicker: `Liked in ${years.get(track.id)}` }));
    };
    const loadWeek = async () => {
      const response = await requestJson("/api/week-on-kasa", { signal: controller.signal });
      if (cancelled) return [];
      return hydrateYouTubeTracks((Array.isArray(response?.tracks) ? response.tracks : []).slice(0, 12).map((track) => track?.id));
    };
    // Optional sources fail independently, without hiding the main feed.
    void Promise.allSettled([loadAnniversary(), loadWeek()]).then(([anniversary, weekly]) => {
      if (!cancelled) setSnapshot({
        owner, privateSession,
        anniversary: anniversary.status === "fulfilled" ? anniversary.value : [],
        weekly: weekly.status === "fulfilled" ? weekly.value : [],
      });
    });
    return () => { cancelled = true; controller.abort(); };
  }, [owner, privateSession, refreshing]);

  const current = snapshot?.owner === owner && snapshot?.privateSession === privateSession ? snapshot : null;
  const allowed = (tracks) => (tracks || []).filter((track) => isTrackAllowed(track, allowExplicit));
  return {
    anniversary: privateSession ? [] : allowed(current?.anniversary),
    weekly: allowed(current?.weekly),
  };
}
