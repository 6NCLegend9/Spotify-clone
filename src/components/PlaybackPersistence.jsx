"use client";

import { useEffect, useRef } from "react";
import { useStore } from "react-redux";
import { useSession } from "next-auth/react";
import { useJam } from "@/components/Jam/JamProvider";
import { playPause, restorePlayback } from "@/redux/features/playerSlice";
import { readPlaybackSnapshot, writePlaybackSnapshot } from "@/utils/playbackSnapshot.mjs";
import { accountOwner } from "@/utils/accountCache.mjs";

const PRE_JAM_SUFFIX = ":pre-jam";

function preJamOwner(owner) {
  return owner ? `${owner}${PRE_JAM_SUFFIX}` : null;
}

export default function PlaybackPersistence() {
  const store = useStore();
  const { data: session, status } = useSession();
  const jam = useJam();
  const owner = accountOwner(session, status);
  const inJam = Boolean(jam?.code);
  const wasInJam = useRef(inJam);

  useEffect(() => {
    const leavingJam = wasInJam.current && !inJam;
    const enteringJam = !wasInJam.current && inJam;
    wasInJam.current = inJam;
    let storage;
    try { storage = window.localStorage; } catch {}

    // Freeze the listener's own queue before Jam overwrites it.
    if (enteringJam && owner && storage) {
      writePlaybackSnapshot(storage, preJamOwner(owner), store.getState().player);
      return undefined;
    }

    if (inJam) return undefined;

    if (leavingJam) {
      store.dispatch(playPause(false));
      const preJam = owner ? readPlaybackSnapshot(storage, preJamOwner(owner)) : null;
      if (preJam) {
        store.dispatch(restorePlayback({ owner, snapshot: preJam }));
        try { storage?.removeItem?.(`heykasa:playback:v1:${encodeURIComponent(preJamOwner(owner))}`); } catch {}
      } else if (owner) {
        store.dispatch(restorePlayback({ owner, snapshot: readPlaybackSnapshot(storage, owner) }));
      }
    } else {
      store.dispatch(restorePlayback({ owner, snapshot: readPlaybackSnapshot(storage, owner) }));
    }

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
        && player.position === previous.position
        && player.queueMode === previous.queueMode
        && player.playbackContext === previous.playbackContext
        && player.userQueue === previous.userQueue
        && player.history === previous.history) return;
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
