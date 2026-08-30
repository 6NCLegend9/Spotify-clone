"use client";
/* eslint-disable jsx-a11y/media-has-caption */
import React, { useRef, useEffect } from "react";
import { useSelector } from "react-redux";
import useAudioEq from "@/hooks/useAudioEq";
import { bandsForPreset } from "@/utils/eqPresets";

const Player = ({
  activeSong,
  isPlaying,
  volume,
  seekTime,
  onEnded,
  onTimeUpdate,
  onLoadedData,
  repeat,
  handlePlayPause,
  handlePrevSong,
  handleNextSong,
  setSeekTime,
  appTime,
}) => {
  const ref = useRef(null);
  const handlePlayPauseRef = useRef(handlePlayPause);
  const mediaActionsRef = useRef({});
  const { eqPreset, eqBands, normalization, monoAudio, masterVolume } = useSelector((state) => state.settings);
  useAudioEq(ref, {
    bands: bandsForPreset(eqPreset, eqBands),
    normalization,
    monoAudio,
  });
  const audioSource =
    activeSong?.downloadUrl?.[4]?.url ||
    activeSong?.downloadUrl?.[3]?.url ||
    activeSong?.downloadUrl?.[2]?.url ||
    "";

  useEffect(() => {
    handlePlayPauseRef.current = handlePlayPause;
  }, [handlePlayPause]);

  useEffect(() => {
    mediaActionsRef.current = {
      handlePlayPause,
      handlePrevSong,
      handleNextSong,
      isPlaying,
      setSeekTime,
    };
  }, [handleNextSong, handlePlayPause, handlePrevSong, isPlaying, setSeekTime]);

  useEffect(() => {
    const audio = ref.current;
    if (!audio) return;

    if (!isPlaying || !audioSource) {
      audio.pause();
      return;
    }

    audio.play().catch((error) => {
      if (error.name !== "AbortError") handlePlayPauseRef.current();
    });
  }, [audioSource, isPlaying]);

  const artistName = Array.isArray(activeSong?.artists?.primary)
    ? activeSong.artists.primary.map((a) => a?.name).join(", ")
    : typeof activeSong?.artists === "string"
    ? activeSong.artists
    : activeSong?.primaryArtists || "Artist";

  const artwork =
    activeSong?.image?.[2]?.url ||
    activeSong?.image?.[1]?.url ||
    activeSong?.image?.[0]?.url ||
    "";
  const albumName = activeSong?.album?.name || "";

  useEffect(() => {
    if (!("mediaSession" in navigator) || !activeSong?.name) return undefined;

    navigator.mediaSession.metadata = new window.MediaMetadata({
      title: activeSong.name,
      artist: artistName,
      album: albumName,
      artwork: artwork
        ? [{ src: artwork, sizes: "500x500", type: "image/jpeg" }]
        : [],
    });

    const setAction = (action, handler) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch (error) {
        // Some browsers expose Media Session but not every action.
      }
    };
    const seekBy = (amount) => {
      const currentTime = ref.current?.currentTime || 0;
      mediaActionsRef.current.setSeekTime?.(Math.max(0, currentTime + amount));
    };

    setAction("play", () => {
      if (!mediaActionsRef.current.isPlaying) {
        mediaActionsRef.current.handlePlayPause?.();
      }
    });
    setAction("pause", () => {
      if (mediaActionsRef.current.isPlaying) {
        mediaActionsRef.current.handlePlayPause?.();
      }
    });
    setAction("previoustrack", () => mediaActionsRef.current.handlePrevSong?.());
    setAction("nexttrack", () => mediaActionsRef.current.handleNextSong?.());
    setAction("seekbackward", (details) => seekBy(-(details.seekOffset || 5)));
    setAction("seekforward", (details) => seekBy(details.seekOffset || 5));

    return () => {
      ["play", "pause", "previoustrack", "nexttrack", "seekbackward", "seekforward"]
        .forEach((action) => setAction(action, null));
    };
  }, [activeSong?.name, albumName, artistName, artwork]);

  useEffect(() => {
    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
    }
  }, [isPlaying]);

  useEffect(() => {
    if (ref.current) {
      ref.current.volume = volume * (Number.isFinite(masterVolume) ? masterVolume : 0.85);
    }
  }, [volume, masterVolume]);
  // updates audio element only on seekTime change (and not on each rerender):
  useEffect(() => {
    if (ref.current) {
      ref.current.currentTime = seekTime;
    }
  }, [seekTime]);

  return (
    <>
      <audio
        src={audioSource}
        ref={ref}
        loop={repeat}
        onEnded={onEnded}
        onTimeUpdate={onTimeUpdate}
        onLoadedData={onLoadedData}
      />
    </>
  );
};

export default Player;
