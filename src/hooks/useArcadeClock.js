"use client";

import { useEffect, useRef } from "react";
import { JAM_PLAYBACK_STATE_EVENT } from "@/utils/jam.mjs";

/**
 * Song-time clock for the arcade. File rounds read the hidden audio element.
 * YouTube rounds interpolate the player's reported currentTime and only nudge
 * when a report disagrees, so tiles do not jump on every player tick.
 */
export default function useArcadeClock({ source = "none", audioRef, videoId } = {}) {
  const playbackRef = useRef({
    time: 0,
    duration: 0,
    at: 0,
    playing: false,
    videoId: "",
    waitForStart: false,
    smooth: 0,
    smoothAt: 0,
    pauseStreak: 0,
  });
  const sourceRef = useRef(source);
  const videoIdRef = useRef(videoId);
  sourceRef.current = source;
  videoIdRef.current = videoId;

  useEffect(() => {
    const stamp = playbackRef.current;
    stamp.videoId = videoId || "";
    stamp.time = 0;
    stamp.smooth = 0;
    stamp.at = performance.now();
    stamp.smoothAt = stamp.at;
    stamp.playing = false;
    stamp.pauseStreak = 0;
  }, [videoId, source]);

  useEffect(() => {
    if (source !== "youtube") return undefined;
    const onState = (event) => {
      const detail = event.detail || {};
      const want = videoIdRef.current;
      if (want && detail.videoId && detail.videoId !== want) return;
      const time = Number(detail.currentTime);
      const duration = Number(detail.duration);
      if (!Number.isFinite(time)) return;

      const stamp = playbackRef.current;
      const now = performance.now();
      const reportedPlaying = detail.isPlaying !== false;
      if (Number.isFinite(duration) && duration > 0) stamp.duration = duration;

      if (stamp.waitForStart) {
        const waited = (now - stamp.at) / 1000;
        if (time > 2.5 && waited < 3) return;
        if (!reportedPlaying && time < 0.4) {
          stamp.time = 0;
          stamp.smooth = 0;
          return;
        }
        stamp.waitForStart = false;
        stamp.time = Math.max(0, time);
        stamp.smooth = stamp.time;
        stamp.at = now;
        stamp.smoothAt = now;
        stamp.playing = reportedPlaying;
        stamp.pauseStreak = 0;
        return;
      }

      const predicted = stamp.playing
        ? stamp.time + (now - stamp.at) / 1000
        : stamp.time;

      if (!reportedPlaying) {
        stamp.pauseStreak += 1;
        // A single paused tick is almost always buffering, not a real stop.
        if (stamp.pauseStreak < 3) return;
        stamp.playing = false;
        stamp.time = time;
        stamp.at = now;
        return;
      }

      stamp.pauseStreak = 0;
      stamp.playing = true;
      const error = time - predicted;
      if (Math.abs(error) < 0.45) {
        if (error > 0.14) {
          stamp.time = predicted + error * 0.2;
          stamp.at = now;
        }
        return;
      }

      stamp.time = time;
      stamp.at = now;
    };
    window.addEventListener(JAM_PLAYBACK_STATE_EVENT, onState);
    return () => window.removeEventListener(JAM_PLAYBACK_STATE_EVENT, onState);
  }, [source]);

  const apiRef = useRef(null);
  if (!apiRef.current) {
    apiRef.current = {
      source,
      getTime() {
        if (sourceRef.current === "file") {
          const audio = audioRef?.current;
          if (!audio) return playbackRef.current.smooth || 0;
          const time = Number(audio.currentTime) || 0;
          const duration = Number(audio.duration);
          playbackRef.current.time = time;
          playbackRef.current.smooth = time;
          playbackRef.current.playing = !audio.paused;
          if (Number.isFinite(duration) && duration > 0) playbackRef.current.duration = duration;
          return time;
        }

        const stamp = playbackRef.current;
        const now = performance.now();
        if (stamp.waitForStart) return stamp.smooth || stamp.time;

        const predicted = stamp.playing
          ? stamp.time + (now - stamp.at) / 1000
          : stamp.time;

        if (!stamp.smoothAt) {
          stamp.smooth = predicted;
          stamp.smoothAt = now;
          return Math.max(0, predicted);
        }

        const dt = Math.min(0.08, Math.max(0, (now - stamp.smoothAt) / 1000));
        stamp.smoothAt = now;
        if (stamp.playing) {
          stamp.smooth += dt;
          const error = predicted - stamp.smooth;
          if (Math.abs(error) > 0.9) stamp.smooth = predicted;
          else stamp.smooth += error * Math.min(1, dt * 4);
        }
        return Math.max(0, stamp.smooth);
      },
      getDuration() {
        if (sourceRef.current === "file") {
          const duration = Number(audioRef?.current?.duration);
          if (Number.isFinite(duration) && duration > 0) playbackRef.current.duration = duration;
        }
        return playbackRef.current.duration || 0;
      },
      isPlaying() {
        if (sourceRef.current === "file") {
          const audio = audioRef?.current;
          return Boolean(audio && !audio.paused && audio.getAttribute("src"));
        }
        return playbackRef.current.playing;
      },
      reset(time = 0) {
        const now = performance.now();
        const stamp = playbackRef.current;
        stamp.time = time;
        stamp.smooth = time;
        stamp.at = now;
        stamp.smoothAt = now;
        stamp.playing = false;
        stamp.pauseStreak = 0;
        stamp.waitForStart = sourceRef.current === "youtube";
      },
    };
  }
  apiRef.current.source = source;
  return apiRef.current;
}
