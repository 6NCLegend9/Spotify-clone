"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { AudioSessionStore, AudioTrack, PlaybackContext, QueueOrigin, RepeatMode } from "../audio/types";

/** Pass the one Redux-backed port created at the persistent application root. */
export default function useAudioStore(port: AudioSessionStore) {
  const state = useSyncExternalStore(port.subscribe, port.getState, port.getState);
  const actions = useMemo(() => ({
    playContext: (tracks: AudioTrack[], index: number, context: PlaybackContext, preserveUserQueue = true) =>
      port.dispatch({ type: "startContext", tracks, index, context, preserveUserQueue }),
    playNext: (track: AudioTrack) => port.dispatch({ type: "enqueue", track, placement: "next" }),
    addToQueue: (track: AudioTrack) => port.dispatch({ type: "enqueue", track, placement: "last" }),
    removeFromQueue: (entryId: string) => port.dispatch({ type: "remove", entryId }),
    moveQueueEntry: (entryId: string, destination: QueueOrigin, beforeEntryId: string | null) =>
      port.dispatch({ type: "move", entryId, destination, beforeEntryId }),
    clearQueue: () => port.dispatch({ type: "clearUserQueue" }),
    selectQueued: (entryId: string) => port.dispatch({ type: "selectQueued", entryId }),
    play: () => port.dispatch({ type: "setPlaying", playing: true }),
    pause: () => port.dispatch({ type: "setPlaying", playing: false }),
    next: () => port.dispatch({ type: "advance", reason: "skip" }),
    previous: () => port.dispatch({ type: "previous" }),
    seek: (position: number) => port.dispatch({ type: "seek", position }),
    setVolume: (volume: number) => port.dispatch({ type: "setVolume", volume }),
    setMuted: (muted: boolean) => port.dispatch({ type: "setMuted", muted }),
    setRepeat: (mode: RepeatMode) => port.dispatch({ type: "setRepeat", mode }),
    // Randomness is captured in the action, keeping Redux replay deterministic.
    setShuffle: (enabled: boolean) => port.dispatch({ type: "setShuffle", enabled, seed: Math.floor(Math.random() * 4294967296) }),
  }), [port]);
  return { state, actions };
}
