"use client";

import { useEffect, useRef } from "react";

/**
 * @typedef {Object} MediaSessionArtwork
 * @property {string} src
 * @property {string} [sizes]
 * @property {string} [type]
 */

/**
 * @typedef {Object} MediaSessionMetadata
 * @property {string} [title]
 * @property {string} [artist]
 * @property {string} [album]
 * @property {MediaSessionArtwork[]} [artwork]
 */

/**
 * @typedef {Object} MediaSessionOptions
 * @property {MediaSessionMetadata} [metadata]           Track metadata for the lock screen / OS UI.
 * @property {boolean} isPlaying                         Current playback state.
 * @property {boolean} [enabled]                         Master switch (default true).
 * @property {() => void} [onPlay]                       OS "play".
 * @property {() => void} [onPause]                      OS "pause".
 * @property {() => void} [onPreviousTrack]              Hardware previous key (should honour the 3-second rule).
 * @property {() => void} [onNextTrack]                  Hardware next key.
 * @property {(seconds: number) => void} [onSeekBackward] Hardware seek-back key.
 * @property {(seconds: number) => void} [onSeekForward]  Hardware seek-forward key.
 * @property {(seconds: number) => void} [onSeekTo]       Lock-screen scrub bar (absolute seconds).
 * @property {{ duration: number, position: number, playbackRate?: number }} [position]  Progress mirrored to the OS.
 * @property {number} [seekOffset]                       Default seek step for hardware seek keys (default 10s).
 */

const MEDIA_ACTIONS = [
  "play",
  "pause",
  "previoustrack",
  "nexttrack",
  "seekbackward",
  "seekforward",
  "seekto",
];

function hasMediaSession() {
  return typeof navigator !== "undefined" && "mediaSession" in navigator;
}

/**
 * Bind OS-level hardware media keys and lock-screen controls to the player via
 * the Media Session API. SSR-safe and cleans up its handlers on unmount.
 *
 * @param {MediaSessionOptions} [options]
 */
export default function useMediaSession(options = {}) {
  const { metadata, isPlaying, enabled = true, bindActions = true, seekOffset = 10 } = options;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const title = metadata?.title || "";
  const artist = metadata?.artist || "";
  const album = metadata?.album || "";
  const artworkKey = Array.isArray(metadata?.artwork)
    ? metadata.artwork.map((item) => item?.src).filter(Boolean).join("|")
    : "";

  // Track metadata shown on the lock screen / media OSD.
  useEffect(() => {
    if (!enabled || !hasMediaSession()) return;
    if (!title) return;
    const artwork = optionsRef.current.metadata?.artwork;
    try {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title,
        artist,
        album,
        artwork: Array.isArray(artwork) ? artwork : [],
      });
    } catch (error) {
      // MediaMetadata is unavailable in this browser; ignore.
    }
  }, [enabled, title, artist, album, artworkKey]);

  // Reflect play/pause state so the OS shows the correct button.
  useEffect(() => {
    if (!enabled || !hasMediaSession()) return;
    try {
      navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
    } catch (error) {
      // playbackState is unsupported; ignore.
    }
  }, [enabled, isPlaying]);

  // Action handlers read the latest callbacks from a ref, so they only need to
  // be (re)bound when the feature is toggled on/off.
  useEffect(() => {
    if (!enabled || !bindActions || !hasMediaSession()) return undefined;
    const session = navigator.mediaSession;

    const setHandler = (action, handler) => {
      try {
        session.setActionHandler(action, handler);
      } catch (error) {
        // Action not supported by this browser; ignore.
      }
    };

    setHandler("play", () => optionsRef.current.onPlay?.());
    setHandler("pause", () => optionsRef.current.onPause?.());
    setHandler("previoustrack", () => optionsRef.current.onPreviousTrack?.());
    setHandler("nexttrack", () => optionsRef.current.onNextTrack?.());
    setHandler("seekbackward", (details) =>
      optionsRef.current.onSeekBackward?.(details?.seekOffset || optionsRef.current.seekOffset || seekOffset),
    );
    setHandler("seekforward", (details) =>
      optionsRef.current.onSeekForward?.(details?.seekOffset || optionsRef.current.seekOffset || seekOffset),
    );
    setHandler("seekto", (details) => {
      if (Number.isFinite(details?.seekTime)) optionsRef.current.onSeekTo?.(details.seekTime);
    });

    return () => {
      MEDIA_ACTIONS.forEach((action) => setHandler(action, null));
    };
  }, [enabled, bindActions, seekOffset]);

  const position = options.position;
  const duration = Number.isFinite(position?.duration) ? position.duration : 0;
  const positionSec = Number.isFinite(position?.position) ? position.position : 0;
  useEffect(() => {
    if (!enabled || !hasMediaSession() || !duration) return;
    try {
      navigator.mediaSession.setPositionState({
        duration,
        position: Math.min(positionSec, duration),
        playbackRate: 1,
      });
    } catch (error) {
      // setPositionState is unsupported here; ignore.
    }
  }, [enabled, duration, positionSec]);
}
