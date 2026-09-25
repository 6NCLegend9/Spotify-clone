"use client";

import CaptionKaraoke from "./CaptionKaraoke";
import usePlaybackClock from "./usePlaybackClock";

export default function ClockedCaptionKaraoke({ clock, ...props }) {
  const snapshot = usePlaybackClock(clock);
  return <CaptionKaraoke {...props} currentTime={snapshot.position} />;
}
