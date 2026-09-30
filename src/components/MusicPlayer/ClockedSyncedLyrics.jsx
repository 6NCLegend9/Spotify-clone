"use client";

import SyncedLyrics from "./SyncedLyrics";
import usePlaybackClock from "./usePlaybackClock";

export default function ClockedSyncedLyrics({ clock, ...props }) {
  const snapshot = usePlaybackClock(clock);
  return (
    <SyncedLyrics
      {...props}
      duration={snapshot.duration}
      currentTime={snapshot.position}
    />
  );
}
