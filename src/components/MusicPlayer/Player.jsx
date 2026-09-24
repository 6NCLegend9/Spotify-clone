"use client";
/* eslint-disable jsx-a11y/media-has-caption */
import React, { useRef, useEffect, useState } from "react";
import { useSelector } from "react-redux";
import UserMessage from "@/components/UserMessage";
import useAudioEq from "@/hooks/useAudioEq";
import { bandsForPreset } from "@/utils/eqPresets";
import { toUserError } from "@/utils/userError";
import { cleanTitle } from "@/utils/text";
import useSleepTimer from "@/hooks/useSleepTimer";
import useListeningInsights from "@/hooks/useListeningInsights";
import { recordDiagnostic } from "@/utils/diagnostics.mjs";
import { playNativeAudio } from "@/utils/nativeAudio.mjs";

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
  const owner = useSelector((state) => state.player.playbackOwner);
  const sleep = useSleepTimer({ owner, trackId: activeSong?.id, enabled: false });
  const checkSleep = sleep.check;
  const handlePlayPauseRef = useRef(handlePlayPause);
  const mediaActionsRef = useRef({});
  const [playbackError, setPlaybackError] = useState(null);
  const { eqPreset, eqBands, normalization, monoAudio, spatialAudio, masterVolume, privateSession, listeningInsights, owner: settingsOwner } = useSelector((state) => state.settings);
  const insights = useListeningInsights({ owner, trackId: activeSong?.id,
    enabled: settingsOwner === owner && listeningInsights === true && !privateSession,
    getSample: () => ({ position: ref.current?.currentTime, playing: ref.current && !ref.current.paused && !ref.current.ended }),
  });
  const resumeContext = useAudioEq(ref, {
    bands: bandsForPreset(eqPreset, eqBands),
    normalization,
    monoAudio,
    spatialAudio,
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
    setPlaybackError(null);
  }, [activeSong?.id, audioSource]);

  useEffect(() => {
    const audio = ref.current;
    if (!audio) return;

    if (!isPlaying) {
      audio.pause();
      return;
    }
    if (checkSleep()) return;

    if (!audioSource) {
      setPlaybackError(toUserError(
        { code: "PLAYBACK_ERROR" },
        { message: "This track does not have a playable audio source." },
      ));
      handlePlayPauseRef.current?.();
      return;
    }

    playNativeAudio(audio, resumeContext).catch((error) => {
      if (error.name === "AbortError") return;
      setPlaybackError(toUserError(
        { code: "PLAYBACK_ERROR", cause: error },
        { message: "The audio could not start. Try again or skip to another track." },
      ));
      handlePlayPauseRef.current?.();
    });
  }, [audioSource, isPlaying, checkSleep, resumeContext]);

  const handleAudioError = (event) => {
    const mediaError = event.currentTarget.error;
    setPlaybackError(toUserError(
      { code: "PLAYBACK_ERROR", cause: mediaError },
      { message: "The audio source could not be loaded. Try again or skip to another track." },
    ));
    if (mediaActionsRef.current.isPlaying) {
      handlePlayPauseRef.current?.();
    }
  };

  const retryPlayback = () => {
    if (checkSleep()) return;
    if (!audioSource || !ref.current) {
      setPlaybackError(toUserError(
        { code: "PLAYBACK_ERROR" },
        { message: "This track does not have a playable audio source." },
      ));
      return;
    }

    setPlaybackError(null);
    ref.current.load();
    if (!mediaActionsRef.current.isPlaying) {
      handlePlayPauseRef.current?.();
    } else {
      playNativeAudio(ref.current, resumeContext).catch((error) => {
        if (error.name === "AbortError") return;
        setPlaybackError(toUserError(
          { code: "PLAYBACK_ERROR", cause: error },
          { message: "The audio could not start. Try again or skip to another track." },
        ));
        if (mediaActionsRef.current.isPlaying) {
          handlePlayPauseRef.current?.();
        }
      });
    }
  };

  const artistName = cleanTitle(
    Array.isArray(activeSong?.artists?.primary)
      ? activeSong.artists.primary.map((a) => a?.name).join(", ")
      : typeof activeSong?.artists === "string"
      ? activeSong.artists
      : activeSong?.primaryArtists || "",
    "Artist",
  );

  const artwork =
    activeSong?.image?.[2]?.url ||
    activeSong?.image?.[1]?.url ||
    activeSong?.image?.[0]?.url ||
    "";
  const albumName = cleanTitle(activeSong?.album?.name || "");

  useEffect(() => {
    if (!("mediaSession" in navigator) || !(activeSong?.name || activeSong?.title)) return undefined;

    navigator.mediaSession.metadata = new window.MediaMetadata({
      title: cleanTitle(activeSong.name || activeSong.title, "HayKasa"),
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
      if (checkSleep()) return;
      playNativeAudio(ref.current, resumeContext).catch((error) => {
        if (error.name === "AbortError") return;
        setPlaybackError(toUserError({ code: "PLAYBACK_ERROR", cause: error }));
        if (mediaActionsRef.current.isPlaying) {
          mediaActionsRef.current.handlePlayPause?.();
        }
      });
      if (!mediaActionsRef.current.isPlaying) {
        mediaActionsRef.current.handlePlayPause?.();
      }
    });
    setAction("pause", () => {
      ref.current?.pause();
      if (mediaActionsRef.current.isPlaying) {
        mediaActionsRef.current.handlePlayPause?.();
      }
    });
    setAction("previoustrack", () => mediaActionsRef.current.handlePrevSong?.());
    setAction("nexttrack", () => mediaActionsRef.current.handleNextSong?.());
    setAction("seekbackward", (details) => seekBy(-(details.seekOffset || 5)));
    setAction("seekforward", (details) => seekBy(details.seekOffset || 5));
    setAction("seekto", (details) => {
      if (!Number.isFinite(details?.seekTime)) return;
      if (ref.current) ref.current.currentTime = Math.max(0, details.seekTime);
      mediaActionsRef.current.setSeekTime?.(Math.max(0, details.seekTime));
    });

    return () => {
      ["play", "pause", "previoustrack", "nexttrack", "seekbackward", "seekforward", "seekto"]
        .forEach((action) => setAction(action, null));
    };
  }, [activeSong?.name, activeSong?.title, albumName, artistName, artwork, checkSleep, resumeContext]);

  useEffect(() => {
    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
    }
  }, [isPlaying]);

  useEffect(() => {
    if (ref.current) {
      ref.current.volume = volume * (Number.isFinite(masterVolume) ? masterVolume : 1);
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
        crossOrigin="anonymous"
        loop={repeat && sleep.timer?.mode !== "track"}
        onEnded={(event) => { insights.finish("completed"); if (!sleep.check(activeSong?.id)) onEnded?.(event); }}
        onPlaying={() => recordDiagnostic("playback_state", { code: "playing" })}
        onPause={() => recordDiagnostic("playback_state", { code: "paused" })}
        onWaiting={() => recordDiagnostic("playback_state", { code: "buffering" })}
        onTimeUpdate={onTimeUpdate}
        onLoadedData={(event) => {
          setPlaybackError(null);
          onLoadedData?.(event);
          if (mediaActionsRef.current.isPlaying && !checkSleep()) {
            playNativeAudio(event.currentTarget, resumeContext).catch((error) => {
              if (error.name === "AbortError") return;
            });
          }
        }}
        onError={handleAudioError}
      />
      {playbackError ? (
        <div className="mt-2 w-full max-w-md" onClick={(event) => event.stopPropagation()}>
          <UserMessage
            tone="error"
            title={playbackError.title}
            message={playbackError.message}
            onRetry={retryPlayback}
            compact
          />
        </div>
      ) : null}
    </>
  );
};

export default Player;
