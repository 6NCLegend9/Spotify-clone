"use client";

import { useStore } from "react-redux";
import useAccountScope from "@/hooks/useAccountScope";
import { beginPlaybackRequest } from "@/redux/features/playerSlice";

// Async collection loads share the same user-intent boundary as the player.
// Account/source changes unmount the owning view; passive provider reports do
// not advance this revision, while a newer Play or Pause does.
export default function usePlaybackRequest() {
  const scope = useAccountScope();
  const store = useStore();
  const currentView = () => scope.isCurrentView()
    && (scope.status !== "authenticated" || scope.isCurrent());
  const begin = () => {
    if (!currentView()) return null;
    store.dispatch(beginPlaybackRequest());
    const revision = store.getState().player.playbackIntentRevision;
    return () => currentView() && store.getState().player.playbackIntentRevision === revision;
  };
  return { begin, scope };
}
