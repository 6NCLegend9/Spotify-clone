"use client";

import { useEffect } from "react";
import { useSelector } from "react-redux";
import { useJam } from "@/components/Jam/JamProvider";
import { DESKTOP_PLAY_PAUSE_EVENT, DESKTOP_PREV_EVENT, DESKTOP_SKIP_EVENT } from "@/utils/jam.mjs";

function desktopPlaybackApi() {
  if (typeof window === "undefined") return null;
  const playback = window.heykasaDesktop?.playback;
  return playback && typeof playback.report === "function" ? playback : null;
}

export default function useDesktopPlaybackBridge() {
  const jam = useJam();
  const video = useSelector((state) => state.player.youtubeVideo);
  const isPlaying = useSelector((state) => state.player.isPlaying);
  const isJamGuest = jam?.role === "guest" && Boolean(jam.code);
  const canPlay = Boolean(video?.id) && !isJamGuest;
  const canSkip = Boolean(video?.id) && (!isJamGuest || jam?.hasAux === true);
  const canPrev = Boolean(video?.id) && !isJamGuest;

  useEffect(() => {
    const api = desktopPlaybackApi();
    if (!api) return undefined;
    void api.report({
      hasTrack: Boolean(video?.id),
      playing: Boolean(isPlaying && video?.id),
      canPlay,
      canSkip,
      canPrev,
      title: video?.title || "",
      artist: video?.channel || "",
      artwork: video?.thumbnail || "",
    });
    return undefined;
  }, [canPlay, canPrev, canSkip, isPlaying, video]);

  useEffect(() => {
    const api = desktopPlaybackApi();
    if (!api?.onCommand) return undefined;
    return api.onCommand((command) => {
      if (command === "play-pause") window.dispatchEvent(new Event(DESKTOP_PLAY_PAUSE_EVENT));
      if (command === "skip") window.dispatchEvent(new Event(DESKTOP_SKIP_EVENT));
      if (command === "prev") window.dispatchEvent(new Event(DESKTOP_PREV_EVENT));
    });
  }, []);
}
