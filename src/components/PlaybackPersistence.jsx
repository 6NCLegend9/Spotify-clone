"use client";

import { useEffect } from "react";
import { useStore } from "react-redux";
import { useSession } from "next-auth/react";
import { useJam } from "@/components/Jam/JamProvider";
import { restorePlayback } from "@/redux/features/playerSlice";
import { readPlaybackSnapshot, writePlaybackSnapshot } from "@/utils/playbackSnapshot.mjs";
import { accountOwner } from "@/utils/accountCache.mjs";

export default function PlaybackPersistence() {
  const store = useStore();
  const { data: session, status } = useSession();
  const jam = useJam();
  const owner = accountOwner(session, status);
  const inJam = Boolean(jam?.code);

  useEffect(() => {
    if (inJam) return undefined;
    let storage;
    try { storage = window.localStorage; } catch {}
    store.dispatch(restorePlayback({ owner, snapshot: readPlaybackSnapshot(storage, owner) }));
    if (!owner) return undefined;
    let timer;
    let pending = null;
    let previous = store.getState().player;
    const flush = () => {
      clearTimeout(timer);
      if (pending) writePlaybackSnapshot(storage, owner, pending);
      pending = null;
    };
    const unsubscribe = store.subscribe(() => {
      const { player, settings } = store.getState();
      if (settings.privateSession || player.playbackOwner !== owner) {
        clearTimeout(timer);
        pending = null;
        previous = player;
        return;
      }
      if (player.youtubeVideo === previous.youtubeVideo
        && player.youtubeQueue === previous.youtubeQueue
        && player.position === previous.position) return;
      previous = player;
      pending = player;
      clearTimeout(timer);
      timer = setTimeout(flush, 300);
    });
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      unsubscribe();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      flush();
    };
  }, [owner, inJam, store]);

  return null;
}