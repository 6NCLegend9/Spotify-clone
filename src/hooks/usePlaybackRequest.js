"use client";

import { useStore } from "react-redux";
import { useRef } from "react";
import useAccountScope from "@/hooks/useAccountScope";
import { beginPlaybackRequest } from "@/redux/features/playerSlice";

// Async collection loads share the same user-intent boundary as the player.
// Passive provider reports do not advance this revision, while a newer Play or
// Pause does. Source identity can change without remounting focused controls.
export default function usePlaybackRequest(identity = null) {
  const scope = useAccountScope();
  const store = useStore();
  const latestIdentity = useRef(null);
  // Retire the old token on every observed change, including A -> B -> A.
  if (latestIdentity.current?.identity !== identity) latestIdentity.current = { identity };
  const source = latestIdentity.current;
  const currentView = () => scope.isCurrentView()
    && latestIdentity.current === source && (scope.status !== "authenticated" || scope.isCurrent());
  const begin = () => {
    if (!currentView()) return null;
    store.dispatch(beginPlaybackRequest());
    const revision = store.getState().player.playbackIntentRevision;
    return () => currentView() && store.getState().player.playbackIntentRevision === revision;
  };
  return { begin, scope };
}
