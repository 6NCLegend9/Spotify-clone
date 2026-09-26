"use client";

import PictureInPictureWindow from "./PictureInPictureWindow";
import usePlaybackClock from "./usePlaybackClock";

export default function ClockedPictureInPictureWindow({ clock, ...props }) {
  const snapshot = usePlaybackClock(clock);
  return (
    <PictureInPictureWindow
      {...props}
      currentTime={snapshot.position}
      duration={snapshot.duration}
    />
  );
}
