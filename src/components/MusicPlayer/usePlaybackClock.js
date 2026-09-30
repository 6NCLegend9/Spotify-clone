"use client";

import { useSyncExternalStore } from "react";

export default function usePlaybackClock(clock) {
  return useSyncExternalStore(clock.subscribe, clock.read, clock.read);
}
