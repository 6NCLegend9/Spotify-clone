"use client";

import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useJam } from "@/components/Jam/JamProvider";
import { playPause } from "@/redux/features/playerSlice";
import { DESKTOP_PREV_EVENT, DESKTOP_SKIP_EVENT } from "@/utils/jam.mjs";

function desktopPlaybackApi() {
  if (typeof window === "undefined") return null;
  const playback = window.heykasaDesktop?.playback;
  return playback && typeof playback.report === "function" ? playback : null;
}

export default function useDesktopPlaybackBridge() {
  const dispatch = useDispatch();
  const jam = useJam();
  const video = useSelector((state) => state.player.youtubeVideo);
  const isPlaying = useSelector((state) => state.player.isPlaying);
  const isJamGuest = jam?.role === "guest" && Boolean(jam.code);
  const canPlay = Boolean(video?.id) && !isJamGuest;
  const canSkip = Boolean(video?.id) && (!isJamGuest || jam?.hasAux === true);
  const canPrev = Boolean(video?.id) && !isJamGuest;
  const playingRef = useRef(isPlaying);
  const jamGuestRef = useRef(isJamGuest);
  playingRef.current = isPlaying;
  jamGuestRef.current = isJamGuest;

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
      if (command === "play-pause") {
        if (jamGuestRef.current) return;
        dispatch(playPause(!playingRef.current));
      }
      if (command === "skip") window.dispatchEvent(new Event(DESKTOP_SKIP_EVENT));
      if (command === "prev") window.dispatchEvent(new Event(DESKTOP_PREV_EVENT));
    });
  }, [dispatch]);
}
