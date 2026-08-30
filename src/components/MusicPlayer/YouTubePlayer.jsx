"use client";

import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useSession } from "next-auth/react";
import {
  playPause,
  setYoutubeVideo,
  setFullScreen,
  addToQueue,
  appendToQueue,
} from "@/redux/features/playerSlice";
import { FiChevronDown, FiChevronUp, FiPause, FiPlay, FiPlus, FiRotateCcw, FiRotateCw, FiSearch, FiX, FiMaximize2, FiMinimize2 } from "react-icons/fi";
import { MdOutlineLyrics, MdPictureInPictureAlt } from "react-icons/md";
import FavouriteTrackButton from "@/components/FavouriteTrackButton";
import AddToPlaylistButton from "@/components/AddToPlaylistButton";
import SyncedLyrics from "@/components/MusicPlayer/SyncedLyrics";
import PictureInPictureWindow, { PIP_DOCUMENT_STYLES } from "@/components/MusicPlayer/PictureInPictureWindow";
import PlayerVolume from "@/components/MusicPlayer/PlayerVolume";
import useSyncedLyrics from "@/hooks/useSyncedLyrics";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { bandsForPreset, youtubePlaybackVolume } from "@/utils/eqPresets";

const formatTime = (seconds) => {
  const value = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
};

const playerErrorMessage = (code) => {
  if (code === 2) return "YouTube could not load this video.";
  if (code === 5) return "This video could not play in your browser.";
  if (code === 100) return "This video is no longer available.";
  if (code === 101 || code === 150) return "This video cannot be played outside YouTube.";
  if (code === 153) return "YouTube could not verify this player.";
  return "YouTube playback failed.";
};

const otherDeck = (key) => (key === "A" ? "B" : "A");
const END_SCREEN_GUARD = 2;

// Best-effort signal for recommendations.js's skip exclusion filter; never blocks playback.
const recordPlayEvent = (id, event) => {
  if (!id) return;
  fetch("/api/playEvent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, event }),
  }).catch(() => {});
};

export default function YouTubePlayer() {
  const dispatch = useDispatch();
  const { status } = useSession();
  const { youtubeVideo: video, youtubeQueue: queue, isPlaying } = useSelector(
    (state) => state.player,
  );
  const {
    dataSaver,
    audioOnly: audioOnlyToggle,
    videoQuality,
    transitionMode,
    crossfadeSeconds,
    eqPreset,
    eqBands,
    normalization,
    syncedLyrics,
    pictureInPicture,
    masterVolume,
  } = useSelector((state) => state.settings);
  const isMobile = useIsMobile();
  const playbackVolume = youtubePlaybackVolume(bandsForPreset(eqPreset, eqBands), normalization);
  // "Audio only" can be set via the dedicated toggle or the Video quality dropdown; either should hide video.
  const audioOnly = audioOnlyToggle || videoQuality === "audio-only";
  // Dual decks let one track fade out while the next fades in at the same time.
  const deckHostRefs = { A: useRef(null), B: useRef(null) };
  const deckPlayerRefs = { A: useRef(null), B: useRef(null) };
  const deckGenerationRef = useRef({ A: 0, B: 0 });
  const activeDeckRef = useRef("A");
  const [activeDeck, setActiveDeck] = useState("A");
  const [fadeProgress, setFadeProgress] = useState(0);
  const crossfadeInProgressRef = useRef(false);
  const crossfadeTimerRef = useRef(null);
  const waitForPlayRef = useRef(null);
  const failSafeRef = useRef(null);
  const pendingNextRef = useRef(null);
  const handledVideoIdRef = useRef(null);
  const tickRef = useRef(() => {});
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [apiReady, setApiReady] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const queueMenuRef = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const expandLockRef = useRef(false);
  const [playerError, setPlayerError] = useState("");
  const [addQuery, setAddQuery] = useState("");
  const [addResults, setAddResults] = useState([]);
  const [addSearching, setAddSearching] = useState(false);
  const autoExtendedForRef = useRef(null);
  const autoExtendingRef = useRef(false);
  const pipWindowRef = useRef(null);
  const pipMountRef = useRef(null);
  const [showLyrics, setShowLyrics] = useState(false);
  const [mobileSheet, setMobileSheet] = useState(false);
  const [sheetTab, setSheetTab] = useState("queue");
  const swipeStartYRef = useRef(null);
  const [pipWindow, setPipWindow] = useState(null);
  const [pipFloat, setPipFloat] = useState(false);
  const videoRef = useRef(video);
  const queueRef = useRef(queue);
  const isPlayingRef = useRef(isPlaying);
  const seekGuardRef = useRef({ seeking: false, until: 0, target: null });
  videoRef.current = video;
  queueRef.current = queue;
  isPlayingRef.current = isPlaying;
  const lyricsQuery = useSyncedLyrics({
    title: video?.title || "",
    artist: video?.channel || "",
    duration,
    enabled: Boolean(video?.title) && syncedLyrics !== false,
  });

  const getActivePlayer = () => deckPlayerRefs[activeDeckRef.current]?.current;

  const playerVideoId = (player) => {
    try {
      return player?.getVideoData?.()?.video_id || "";
    } catch (error) {
      return "";
    }
  };

  const isSeekGuarded = () => {
    const guard = seekGuardRef.current;
    return guard.seeking || performance.now() < guard.until;
  };

  const getNextVideo = () => {
    const currentId = videoRef.current?.id;
    const list = queueRef.current || [];
    const index = list.findIndex((item) => item.id === currentId);
    if (index < 0) return null;
    return list[index + 1] || null;
  };

  const getPreviousVideo = () => {
    const currentId = videoRef.current?.id;
    const list = queueRef.current || [];
    const index = list.findIndex((item) => item.id === currentId);
    if (index <= 0) return null;
    return list[index - 1] || null;
  };

  const getPlayerForCurrentVideo = () => {
    const want = videoRef.current?.id;
    if (want) {
      for (const key of ["A", "B"]) {
        const player = deckPlayerRefs[key].current;
        if (player && playerVideoId(player) === want) {
          if (activeDeckRef.current !== key) {
            activeDeckRef.current = key;
            setActiveDeck(key);
          }
          return player;
        }
      }
    }
    return getActivePlayer();
  };

  const silenceIdleDeck = () => {
    const idle = deckPlayerRefs[otherDeck(activeDeckRef.current)].current;
    try {
      idle?.pauseVideo?.();
      idle?.mute?.();
      idle?.setVolume?.(0);
    } catch (error) {
      // Idle deck may already be gone.
    }
  };

  const applyPlaybackVolume = (player, ratio = 1) => {
    const master = Number.isFinite(masterVolume) ? masterVolume : 0.85;
    player?.setVolume?.(Math.round(playbackVolume * master * ratio));
  };

  const destroyDeck = (key) => {
    deckGenerationRef.current[key] += 1;
    const player = deckPlayerRefs[key].current;
    deckPlayerRefs[key].current = null;
    player?.destroy?.();
    deckHostRefs[key].current?.replaceChildren();
  };

  const cancelCrossfade = () => {
    if (crossfadeTimerRef.current) {
      window.cancelAnimationFrame(crossfadeTimerRef.current);
      window.clearTimeout(crossfadeTimerRef.current);
      crossfadeTimerRef.current = null;
    }
    if (waitForPlayRef.current) {
      window.clearInterval(waitForPlayRef.current);
      waitForPlayRef.current = null;
    }
    if (failSafeRef.current) {
      window.clearTimeout(failSafeRef.current);
      failSafeRef.current = null;
    }
    crossfadeInProgressRef.current = false;
    pendingNextRef.current = null;
    setFadeProgress(0);
  };

  // Abandons an in-flight fade so a manual pause/seek never leaves a second deck audibly playing.
  const abortCrossfade = () => {
    if (!crossfadeInProgressRef.current) return;
    cancelCrossfade();
    destroyDeck(otherDeck(activeDeckRef.current));
  };

  const mountDeck = (key, videoId, { onFirstPlaying } = {}) => {
    const host = deckHostRefs[key].current;
    if (!host) return null;
    destroyDeck(key);
    const generation = deckGenerationRef.current[key];
    const isCurrent = () => deckGenerationRef.current[key] === generation;

    const playerParams = new URLSearchParams({
      autoplay: "1",
      cc_load_policy: "0",
      controls: "0",
      disablekb: "1",
      enablejsapi: "1",
      fs: "0",
      iv_load_policy: "3",
      modestbranding: "1",
      mute: "1",
      origin: window.location.origin,
      playsinline: "1",
      rel: "0",
      showinfo: "0",
      widget_referrer: window.location.href,
    });
    const iframe = document.createElement("iframe");
    iframe.src = `https://www.youtube.com/embed/${videoId}?${playerParams}`;
    iframe.title = "YouTube video player";
    iframe.allow = "autoplay; encrypted-media; picture-in-picture";
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.border = "0";
    host.replaceChildren(iframe);

    let hasUnmutedOnce = false;
    const player = new window.YT.Player(iframe, {
      events: {
        onReady: (event) => {
          if (!isCurrent()) return;
          const frame = event.target.getIframe();
          frame.style.width = "100%";
          frame.style.height = "100%";
          frame.style.pointerEvents = "none";
          frame.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
          if (key === activeDeckRef.current) {
            setDuration(event.target.getDuration());
            if (videoQuality !== "auto" && videoQuality !== "audio-only") {
              event.target.setPlaybackQuality(videoQuality);
            }
          }
          event.target.mute();
          event.target.playVideo();
        },
        onStateChange: (event) => {
          if (!isCurrent()) return;
          if (event.data === window.YT.PlayerState.PLAYING) {
            if (!hasUnmutedOnce) {
              hasUnmutedOnce = true;
              if (key === activeDeckRef.current) {
                event.target.unMute();
                applyPlaybackVolume(event.target);
              }
            }
            if (key === activeDeckRef.current) setPlayerError("");
            onFirstPlaying?.(event.target);
          }
          if (key !== activeDeckRef.current) return;
          if (event.data === window.YT.PlayerState.PLAYING) dispatch(playPause(true));
          if (
            event.data === window.YT.PlayerState.PAUSED &&
            !crossfadeInProgressRef.current &&
            !expandLockRef.current &&
            !isSeekGuarded()
          ) {
            dispatch(playPause(false));
          }
          if (event.data === window.YT.PlayerState.ENDED) {
            // seekTo() often emits a fake ENDED. Ignore it unless we are actually at the end
            // of the track that Redux currently has selected — otherwise we jump back to
            // whatever song this deck was first mounted with.
            if (isSeekGuarded()) return;
            const endedAt = event.target.getCurrentTime?.() || 0;
            const endedDur = event.target.getDuration?.() || 0;
            if (endedDur > 1 && endedAt < endedDur - 1.5) return;

            const nextVideo = pendingNextRef.current || getNextVideo();
            const incomingKey = otherDeck(key);
            const incoming = deckPlayerRefs[incomingKey].current;
            const incomingPlaying =
              incoming?.getPlayerState?.() === window.YT?.PlayerState?.PLAYING;
            if (crossfadeInProgressRef.current && incomingPlaying && nextVideo) {
              completeCrossfade(key, incomingKey, nextVideo);
              return;
            }
            if (crossfadeInProgressRef.current && nextVideo) {
              cancelCrossfade();
              destroyDeck(incomingKey);
              dispatch(setYoutubeVideo(nextVideo));
              return;
            }
            if (!crossfadeInProgressRef.current && nextVideo) {
              if (status === "authenticated" && videoRef.current?.id) {
                recordPlayEvent(videoRef.current.id, "completed");
              }
              dispatch(setYoutubeVideo(nextVideo));
            }
          }
        },
        onAutoplayBlocked: () => {
          if (!isCurrent()) return;
          if (key === activeDeckRef.current) {
            dispatch(playPause(false));
          } else {
            crossfadeInProgressRef.current = false;
            destroyDeck(key);
          }
        },
        onError: (event) => {
          if (!isCurrent()) return;
          if (key === activeDeckRef.current) {
            setPlayerError(playerErrorMessage(event.data));
            dispatch(playPause(false));
          } else {
            crossfadeInProgressRef.current = false;
            destroyDeck(key);
          }
        },
      },
    });
    deckPlayerRefs[key].current = player;
    return player;
  };

  const completeCrossfade = (outgoingKey, incomingKey, nextVideo) => {
    if (status === "authenticated" && video?.id) recordPlayEvent(video.id, "completed");
    const incomingPlayer = deckPlayerRefs[incomingKey].current;
    applyPlaybackVolume(incomingPlayer);
    incomingPlayer?.unMute?.();
    incomingPlayer?.playVideo?.();
    destroyDeck(outgoingKey);
    activeDeckRef.current = incomingKey;
    setActiveDeck(incomingKey);
    setFadeProgress(0);
    crossfadeInProgressRef.current = false;
    pendingNextRef.current = null;
    handledVideoIdRef.current = nextVideo.id;
    setCurrentTime(0);
    setDuration(incomingPlayer?.getDuration?.() || 0);
    dispatch(setYoutubeVideo(nextVideo));
  };

  const runCrossfadeRamp = (outgoingKey, incomingKey, nextVideo, durationSeconds) => {
    const totalMs = Math.max(800, Math.min(durationSeconds * 1000, 10000));
    const startedAt = performance.now();
    const outgoingGeneration = deckGenerationRef.current[outgoingKey];
    const incomingGeneration = deckGenerationRef.current[incomingKey];

    const step = (now) => {
      if (
        deckGenerationRef.current[outgoingKey] !== outgoingGeneration ||
        deckGenerationRef.current[incomingKey] !== incomingGeneration
      ) {
        crossfadeInProgressRef.current = false;
        return;
      }
      const progress = Math.min(1, (now - startedAt) / totalMs);
      applyPlaybackVolume(deckPlayerRefs[outgoingKey].current, Math.cos((progress * Math.PI) / 2));
      applyPlaybackVolume(deckPlayerRefs[incomingKey].current, Math.sin((progress * Math.PI) / 2));
      if (progress === 0 || progress === 1 || Math.round(progress * 20) !== Math.round((progress - 0.016) * 20)) {
        setFadeProgress(progress);
      }

      if (progress >= 1) {
        completeCrossfade(outgoingKey, incomingKey, nextVideo);
        return;
      }
      crossfadeTimerRef.current = window.requestAnimationFrame(step);
    };
    crossfadeTimerRef.current = window.requestAnimationFrame(step);
  };

  const startCrossfade = (nextVideo, durationSeconds) => {
    if (crossfadeInProgressRef.current) return;
    crossfadeInProgressRef.current = true;
    pendingNextRef.current = nextVideo;
    const outgoingKey = activeDeckRef.current;
    const incomingKey = otherDeck(outgoingKey);
    failSafeRef.current = window.setTimeout(() => {
      if (!crossfadeInProgressRef.current) return;
      const incoming = deckPlayerRefs[incomingKey].current;
      if (incoming?.getPlayerState?.() === window.YT?.PlayerState?.PLAYING) {
        completeCrossfade(outgoingKey, incomingKey, nextVideo);
        return;
      }
      cancelCrossfade();
      const outgoing = deckPlayerRefs[outgoingKey].current;
      outgoing?.unMute?.();
      applyPlaybackVolume(outgoing);
      outgoing?.loadVideoById?.(nextVideo.id);
      outgoing?.playVideo?.();
      handledVideoIdRef.current = nextVideo.id;
      dispatch(playPause(true));
      dispatch(setYoutubeVideo(nextVideo));
    }, 5000);

    const beginRamp = (incomingPlayer) => {
      if (failSafeRef.current) {
        window.clearTimeout(failSafeRef.current);
        failSafeRef.current = null;
      }
      if (waitForPlayRef.current) {
        window.clearInterval(waitForPlayRef.current);
        waitForPlayRef.current = null;
      }
      incomingPlayer.unMute();
      applyPlaybackVolume(incomingPlayer, 0);
      incomingPlayer.playVideo?.();
      runCrossfadeRamp(outgoingKey, incomingKey, nextVideo, durationSeconds);
    };

    const existing = deckPlayerRefs[incomingKey].current;
    if (existing?.loadVideoById) {
      existing.mute?.();
      existing.setVolume?.(0);
      existing.loadVideoById(nextVideo.id);
      existing.playVideo?.();
      waitForPlayRef.current = window.setInterval(() => {
        if (!crossfadeInProgressRef.current) {
          window.clearInterval(waitForPlayRef.current);
          waitForPlayRef.current = null;
          return;
        }
        if (existing.getPlayerState?.() === window.YT?.PlayerState?.PLAYING) {
          window.clearInterval(waitForPlayRef.current);
          waitForPlayRef.current = null;
          beginRamp(existing);
        }
      }, 150);
      return;
    }

    mountDeck(incomingKey, nextVideo.id, {
      onFirstPlaying: beginRamp,
    });
  };

  useEffect(() => {
    if (window.YT?.Player) {
      setApiReady(true);
      return;
    }
    const existingScript = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
    if (!existingScript) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(script);
    }
    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      setApiReady(true);
    };
    return () => {
      window.onYouTubeIframeAPIReady = previousReady;
    };
  }, []);

  useEffect(() => {
    if (!video || !apiReady) return;

    // The crossfade engine already loaded and is playing this exact track; just adopt it.
    if (handledVideoIdRef.current === video.id) {
      handledVideoIdRef.current = null;
      return;
    }

    cancelCrossfade();
    seekGuardRef.current = { seeking: false, until: 0, target: null };
    setPlayerError("");
    setCurrentTime(0);
    setDuration(0);
    dispatch(playPause(true));
    const existing = getActivePlayer();
    if (existing?.loadVideoById) {
      existing.unMute?.();
      applyPlaybackVolume(existing);
      existing.loadVideoById(video.id);
      existing.playVideo?.();
      silenceIdleDeck();
      return;
    }
    destroyDeck("A");
    destroyDeck("B");
    activeDeckRef.current = "A";
    setActiveDeck("A");
    mountDeck("A", video.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video?.id, apiReady]);

  useEffect(() => () => {
    cancelCrossfade();
    destroyDeck("A");
    destroyDeck("B");
    try {
      pipWindowRef.current?.close?.();
    } catch (error) {
      // already closed
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    tickRef.current = () => {
      const activePlayer = getPlayerForCurrentVideo();
      if (!activePlayer?.getCurrentTime) return;
      const time = activePlayer.getCurrentTime();
      const dur = activePlayer.getDuration();
      const guard = seekGuardRef.current;
      const seekPending = guard.target != null && (guard.seeking || Math.abs(time - guard.target) > 1.5);
      setCurrentTime(seekPending ? guard.target : time);
      setDuration(dur);
      if (!guard.seeking && guard.target != null && Math.abs(time - guard.target) <= 1.5) {
        guard.target = null;
      }

      if (isSeekGuarded() || !isPlaying || crossfadeInProgressRef.current || !dur) return;
      const remaining = dur - time;
      const nextVideo = getNextVideo();
      if (!nextVideo) return;
      const fadeSeconds = transitionMode === "off" ? 0 : Number(crossfadeSeconds) || 0;
      if (fadeSeconds > 0 && remaining <= fadeSeconds && remaining > 0.35) {
        startCrossfade(nextVideo, Math.min(fadeSeconds, Math.max(remaining - 0.35, 0.8)));
        return;
      }
      if (remaining <= END_SCREEN_GUARD && remaining > 0) {
        dispatch(setYoutubeVideo(nextVideo));
      }
    };
  });

  // Keeps the queue from running dry: pulls in more songs by the same channel once only one track is left.
  useEffect(() => {
    if (!video || autoExtendingRef.current || autoExtendedForRef.current === video.id) return;
    const index = queue.findIndex((item) => item.id === video.id);
    if (index === -1 || index < queue.length - 1) return;

    autoExtendedForRef.current = video.id;
    autoExtendingRef.current = true;
    (async () => {
      try {
        const seed = video.seedQuery || video.genre || video.channel || video.title;
        const response = await fetch(`/api/youtube-search?type=video&q=${encodeURIComponent(seed)}`);
        const data = response.ok ? await response.json() : null;
        const existingIds = new Set(queue.map((item) => item.id));
        const extras = (data?.results || [])
          .filter((item) => !existingIds.has(item.id))
          .slice(0, 5)
          .map((item) => ({
            ...item,
            seedQuery: video.seedQuery || video.genre || seed,
            genre: video.genre,
          }));
        if (extras.length > 0) dispatch(appendToQueue(extras));
      } catch (error) {
        // Silent: running out of extra tracks isn't worth surfacing to the user.
      } finally {
        autoExtendingRef.current = false;
      }
    })();
  }, [video, queue, dispatch]);

  const handleAddSearch = async (event) => {
    event.preventDefault();
    if (!addQuery.trim() || addSearching) return;
    setAddSearching(true);
    try {
      const response = await fetch(`/api/youtube-search?type=video&q=${encodeURIComponent(addQuery.trim())}`);
      const data = response.ok ? await response.json() : null;
      setAddResults((data?.results || []).slice(0, 6));
    } catch (error) {
      setAddResults([]);
    } finally {
      setAddSearching(false);
    }
  };

  const handleAddTrack = (track) => {
    dispatch(addToQueue(track));
    setAddResults((current) => current.filter((item) => item.id !== track.id));
  };

  useEffect(() => {
    if (!showQueue) return;
    const handler = (event) => {
      if (!queueMenuRef.current?.contains(event.target)) setShowQueue(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showQueue]);

  useEffect(() => {
    const ms = showLyrics || pipWindow || pipFloat ? 120 : 500;
    const interval = window.setInterval(() => tickRef.current(), ms);
    return () => window.clearInterval(interval);
  }, [showLyrics, pipWindow, pipFloat]);

  useEffect(() => {
    applyPlaybackVolume(getActivePlayer());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbackVolume, masterVolume]);

  useEffect(() => {
    if (!video || !apiReady || transitionMode === "off" || crossfadeInProgressRef.current) return;
    const nextVideo = getNextVideo();
    if (!nextVideo) return;
    const idleKey = otherDeck(activeDeckRef.current);
    const idle = deckPlayerRefs[idleKey].current;
    if (!idle?.cueVideoById) return;
    idle.cueVideoById(nextVideo.id);
    idle.mute?.();
    idle.setVolume?.(0);
  }, [video?.id, queue, apiReady, transitionMode]);

  useEffect(() => {
    if (crossfadeInProgressRef.current || isSeekGuarded()) return;
    const player = getPlayerForCurrentVideo();
    if (!player?.getPlayerState) return;
    if (isPlaying) player.playVideo();
    else player.pauseVideo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  const seekOnCurrentTrack = (nextTime, { dragging = false } = {}) => {
    const time = Math.max(0, Number(nextTime) || 0);
    abortCrossfade();
    silenceIdleDeck();
    setFadeProgress(0);
    seekGuardRef.current.seeking = dragging;
    seekGuardRef.current.target = time;
    seekGuardRef.current.until = performance.now() + 2500;
    setCurrentTime(time);
    const player = getPlayerForCurrentVideo();
    try {
      player?.seekTo?.(time, true);
      if (isPlayingRef.current) player?.playVideo?.();
    } catch (error) {
      // Player may still be loading the current video.
    }
  };

  const handlePlayPause = () => {
    abortCrossfade();
    const player = getActivePlayer();
    if (!player?.playVideo) return;

    if (isPlaying) {
      player.pauseVideo();
      return;
    }

    player.unMute?.();
    applyPlaybackVolume(player);
    player.playVideo();
  };

  const handleNext = ({ completed = false } = {}) => {
    const current = videoRef.current;
    if (status === "authenticated" && current?.id) recordPlayEvent(current.id, completed ? "completed" : "skipped");
    const nextVideo = getNextVideo();
    if (nextVideo) dispatch(setYoutubeVideo(nextVideo));
  };

  const handlePrev = () => {
    const previous = getPreviousVideo();
    if (previous) {
      if (status === "authenticated" && videoRef.current?.id) recordPlayEvent(videoRef.current.id, "skipped");
      dispatch(setYoutubeVideo(previous));
      return;
    }
    seekOnCurrentTrack(0);
  };

  const closePictureInPicture = () => {
    try {
      pipWindowRef.current?.close?.();
    } catch (error) {
      // Window may already be closed.
    }
    pipWindowRef.current = null;
    pipMountRef.current = null;
    setPipWindow(null);
    setPipFloat(false);
  };

  const openDocumentPip = async () => {
    if (!window.documentPictureInPicture?.requestWindow) return false;
    try {
      const pip = await window.documentPictureInPicture.requestWindow({ width: 420, height: 520 });
      const style = pip.document.createElement("style");
      style.textContent = PIP_DOCUMENT_STYLES;
      pip.document.head.appendChild(style);
      const mount = pip.document.createElement("div");
      mount.id = "hayasaka-pip";
      mount.style.height = "100%";
      pip.document.body.appendChild(mount);
      pip.addEventListener("pagehide", () => {
        pipWindowRef.current = null;
        pipMountRef.current = null;
        setPipWindow(null);
      });
      pipWindowRef.current = pip;
      pipMountRef.current = mount;
      setPipWindow(pip);
      return true;
    } catch (error) {
      return false;
    }
  };

  const togglePictureInPicture = async () => {
    if (isMobile || pictureInPicture === false) return;
    if (pipWindowRef.current || pipFloat) {
      closePictureInPicture();
      return;
    }
    abortCrossfade();
    const opened = await openDocumentPip();
    if (!opened) setPipFloat(true);
  };

  const playQueueItem = (item) => {
    if (!item?.id) return;
    if (status === "authenticated" && video?.id) recordPlayEvent(video.id, "skipped");
    abortCrossfade();
    dispatch(playPause(true));
    dispatch(setYoutubeVideo(item));
    setShowQueue(false);
  };

  const onFullscreenSwipeStart = (event) => {
    swipeStartYRef.current = event.touches?.[0]?.clientY ?? null;
  };

  const onFullscreenSwipeEnd = (event) => {
    if (swipeStartYRef.current == null) return;
    const endY = event.changedTouches?.[0]?.clientY;
    const delta = (endY ?? swipeStartYRef.current) - swipeStartYRef.current;
    swipeStartYRef.current = null;
    if (delta < -56) {
      setMobileSheet(true);
      setShowQueue(true);
      setShowLyrics(syncedLyrics !== false);
      return;
    }
    if (delta > 56) {
      setMobileSheet(false);
      setShowQueue(false);
      setShowLyrics(false);
    }
  };

  const toggleLyrics = () => {
    if (syncedLyrics === false) return;
    setShowLyrics((value) => !value);
  };

  useEffect(() => {
    if (isMobile) closePictureInPicture();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile]);

  const seekBy = (amount) => {
    const base = seekGuardRef.current.target ?? currentTime;
    seekOnCurrentTrack(Math.max(0, base + amount));
  };

  const handleSeek = (event) => {
    seekOnCurrentTrack(Number(event.target.value), { dragging: seekGuardRef.current.seeking });
  };

  const endSeekDrag = (event) => {
    seekOnCurrentTrack(Number(event.currentTarget.value));
    seekGuardRef.current.seeking = false;
    seekGuardRef.current.until = performance.now() + 2500;
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!video) return;
      const target = event.target;
      const isTypingTarget = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if (isTypingTarget || event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.code === "Space") {
        event.preventDefault();
        handlePlayPause();
      } else if (event.key === "m" || event.key === "M") {
        const player = getActivePlayer();
        if (!player) return;
        if (player.isMuted?.()) player.unMute?.();
        else player.mute?.();
      } else if (event.key === "Escape" && expanded) {
        event.preventDefault();
        toggleExpanded();
      } else if (event.key === "f" || event.key === "F" || event.key === "v" || event.key === "V") {
        if (!dataSaver && !audioOnly) toggleExpanded();
      } else if (event.key === "j" || event.key === "J") {
        seekBy(-10);
      } else if (event.key === "l" || event.key === "L") {
        seekBy(10);
      } else if (event.shiftKey && (event.key === "N" || event.key === "n")) {
        handleNext();
      } else if (event.key === "p" || event.key === "P") {
        togglePictureInPicture();
      } else if (event.key === "t" || event.key === "T") {
        toggleLyrics();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  useEffect(() => {
    if (!("mediaSession" in navigator) || !video) return undefined;
    navigator.mediaSession.metadata = new window.MediaMetadata({
      title: video.title || "Hayasaka",
      artist: video.channel || "",
      artwork: video.thumbnail
        ? [{ src: video.thumbnail, sizes: "480x360", type: "image/jpeg" }]
        : [],
    });
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
    try {
      navigator.mediaSession.setActionHandler("play", handlePlayPause);
      navigator.mediaSession.setActionHandler("pause", handlePlayPause);
      navigator.mediaSession.setActionHandler("previoustrack", handlePrev);
      navigator.mediaSession.setActionHandler("nexttrack", handleNext);
      navigator.mediaSession.setActionHandler("seekbackward", () => seekBy(-10));
      navigator.mediaSession.setActionHandler("seekforward", () => seekBy(10));
    } catch (error) {
      // Some browsers reject individual handlers.
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video, isPlaying]);


  if (!video) return null;

  const videoVisible = !dataSaver && !audioOnly;
  const outgoingOpacity = 1 - fadeProgress;
  const incomingOpacity = fadeProgress;

  const toggleExpanded = () => {
    if (dataSaver || audioOnly) return;
    expandLockRef.current = true;
    window.setTimeout(() => {
      expandLockRef.current = false;
    }, 1500);
    setExpanded((value) => {
      const next = !value;
      dispatch(setFullScreen(next));
      if (next) closePictureInPicture();
      return next;
    });
    window.requestAnimationFrame(() => {
      const player = getActivePlayer();
      player?.unMute?.();
      applyPlaybackVolume(player);
      if (isPlaying) player?.playVideo?.();
    });
  };

  const fullscreen = expanded && videoVisible;
  const currentQueueIndex = queue.findIndex((item) => item.id === video.id);
  const upcoming = currentQueueIndex === -1 ? queue : queue.slice(currentQueueIndex + 1);
  const showDesktopQueue = showQueue && !(fullscreen && isMobile);
  const showMobileSheet = fullscreen && isMobile && mobileSheet;

  return (
    <div
      className={fullscreen ? "relative flex h-full min-h-0 w-full flex-1 flex-col bg-black" : "relative grid w-full grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-3 py-2 sm:px-6"}
      onClick={(event) => event.stopPropagation()}
      onTouchStart={fullscreen ? onFullscreenSwipeStart : undefined}
      onTouchEnd={fullscreen ? onFullscreenSwipeEnd : undefined}
    >
      {pipFloat && videoVisible && !expanded && (
        <img src={video.thumbnail} alt="" className="h-14 w-[5.6rem] shrink-0 rounded-md object-cover ring-1 ring-white/10 sm:h-16 sm:w-28" />
      )}
      <div className={pipFloat && !fullscreen ? "yt-crop yt-pip-float bg-black ring-1 ring-white/15" : fullscreen ? "yt-crop yt-expand-stage bg-black" : videoVisible ? "yt-crop relative h-14 w-[5.6rem] shrink-0 rounded-md bg-black ring-1 ring-white/10 sm:h-16 sm:w-28" : "yt-crop pointer-events-none absolute -left-[10000px] top-0 h-[200px] w-[356px]"}>
        {["A", "B"].map((key) => (
          <div
            key={key}
            className="absolute inset-0 h-full w-full"
            style={{ opacity: key === activeDeck ? outgoingOpacity : incomingOpacity }}
          >
            <div ref={deckHostRefs[key]} className="yt-crop-frame h-full w-full" />
          </div>
        ))}
        <div className="yt-chrome-mask" aria-hidden="true" />
        {pipFloat && !expanded && (
          <button
            type="button"
            aria-label="Close picture in picture"
            title="Close picture in picture"
            onClick={closePictureInPicture}
            className="absolute right-2 top-2 z-20 rounded-full bg-black/70 p-1.5 text-white hover:bg-black/90"
          >
            <FiX size={14} />
          </button>
        )}
        {playerError && (
          <div className="absolute inset-0 z-10 grid place-content-center bg-black/90 p-3 text-center">
            <p className="text-xs font-medium text-white">{playerError}</p>
            <a href={`https://www.youtube.com/watch?v=${video.id}`} target="_blank" rel="noreferrer" className="mt-2 text-xs font-semibold text-[#00e6e6] hover:underline">Open on YouTube</a>
          </div>
        )}
      </div>
      <div className={fullscreen ? "pointer-events-none absolute left-5 top-5 z-20 min-w-0" : "min-w-0"}>
        {fullscreen ? (
          <div>
            <p className="text-xs uppercase tracking-widest text-[#00e6e6]">Now playing</p>
            <p className="mt-2 max-w-[70vw] truncate text-lg font-semibold text-white">{video.title}</p>
            <p className="text-sm text-gray-300">{video.channel}</p>
          </div>
        ) : (
          <div className="flex min-w-0 items-center gap-3">
            {!videoVisible && (
              <img
                src={video.thumbnail}
                alt=""
                className="h-11 w-11 shrink-0 rounded-lg object-cover ring-1 ring-white/10 sm:h-12 sm:w-12"
              />
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{video.title}</p>
              <p className="mt-1 truncate text-xs text-gray-400">{video.channel}</p>
            </div>
          </div>
        )}
      </div>
      <div className={fullscreen ? "absolute inset-x-0 bottom-4 z-20 mx-auto flex w-[min(92vw,880px)] flex-col items-center gap-2" : "flex flex-col items-center justify-center gap-1"}>
        <div className={fullscreen ? "relative flex w-full items-center justify-center gap-1 text-gray-200" : "flex shrink-0 items-center gap-1 text-gray-200"}>
        {fullscreen && <div className="pointer-events-none w-28 shrink-0 sm:w-36" />}
          <div className={fullscreen ? "flex items-center gap-1 rounded-full bg-black/70 px-3 py-2 backdrop-blur" : "contents"}>
          <button type="button" aria-label="Seek back 10 seconds" title="Back 10 seconds" onClick={() => seekBy(-10)} className="rounded-full p-2 hover:bg-white/10"><FiRotateCcw /></button>
          <button type="button" aria-label={isPlaying ? "Pause" : "Play"} title={isPlaying ? "Pause" : "Play"} onClick={handlePlayPause} className="rounded-full bg-[#00e6e6] p-2 text-black hover:scale-105">{isPlaying ? <FiPause /> : <FiPlay />}</button>
          <button type="button" aria-label="Seek forward 10 seconds" title="Forward 10 seconds" onClick={() => seekBy(10)} className="rounded-full p-2 hover:bg-white/10"><FiRotateCw /></button>
          </div>
          {fullscreen && <div className="flex w-28 shrink-0 justify-end sm:w-36"><PlayerVolume /></div>}
        </div>
        <div className={fullscreen ? "w-full" : "w-32 sm:w-64 md:w-96"}>
          <input
            aria-label="YouTube song progress"
            type="range"
            min="0"
            max={duration || 0}
            value={Math.min(currentTime, duration || 0)}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture?.(event.pointerId);
              seekGuardRef.current.seeking = true;
            }}
            onPointerUp={endSeekDrag}
            onPointerCancel={() => {
              seekGuardRef.current.seeking = false;
              seekGuardRef.current.until = performance.now() + 2500;
            }}
            onChange={handleSeek}
            className="w-full accent-[#00e6e6]"
          />
          <div className="flex justify-between text-[10px] text-gray-400"><span>{formatTime(currentTime)}</span><span>{formatTime(duration)}</span></div>
        </div>
      </div>
      <div className={fullscreen ? "absolute right-5 top-5 z-20 flex items-center justify-end gap-2" : "flex items-center justify-end gap-2"}>
      {!expanded && <div className="hidden sm:block"><AddToPlaylistButton track={video} /></div>}
      {!expanded && <div className="hidden sm:block"><FavouriteTrackButton track={video} /></div>}
      <div ref={queueMenuRef} className="relative flex items-center gap-2">
        {!(fullscreen && isMobile) && (
          <button type="button" aria-expanded={showQueue} onClick={() => { setShowQueue((value) => !value); if (isMobile && fullscreen) setMobileSheet((value) => !value); }} className={expanded && !dataSaver && !audioOnly ? "flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-xs text-gray-300 hover:bg-white/10" : "flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-300 hover:bg-white/10"}><span className="hidden sm:inline">Next up</span> {showQueue ? <FiChevronDown /> : <FiChevronUp />}</button>
        )}
        {!(fullscreen && isMobile) && (
        <button
          type="button"
          aria-pressed={showLyrics}
          aria-label={showLyrics ? "Hide lyrics" : "Show live lyrics"}
          title={syncedLyrics === false ? "Live lyrics are turned off in Settings" : showLyrics ? "Hide lyrics" : "Live lyrics"}
          disabled={syncedLyrics === false}
          onClick={toggleLyrics}
          className={expanded && !dataSaver && !audioOnly ? `rounded-full bg-black/60 p-2 hover:bg-white/10 disabled:opacity-40 ${showLyrics ? "text-[#00e6e6]" : "text-white"}` : `rounded-full p-2 hover:bg-white/10 disabled:opacity-40 ${showLyrics ? "text-[#00e6e6]" : "text-gray-300"}`}
        >
          <MdOutlineLyrics size={18} />
        </button>
        )}
        {!isMobile && (
        <button
          type="button"
          aria-pressed={Boolean(pipWindow || pipFloat)}
          aria-label={pipWindow || pipFloat ? "Exit picture in picture" : "Picture in picture"}
          title={pictureInPicture === false ? "Picture-in-picture is turned off in Settings" : "Picture in picture"}
          disabled={pictureInPicture === false}
          onClick={togglePictureInPicture}
          className={expanded && !dataSaver && !audioOnly ? `rounded-full bg-black/60 p-2 hover:bg-white/10 disabled:opacity-40 ${pipWindow || pipFloat ? "text-[#00e6e6]" : "text-white"}` : `rounded-full p-2 hover:bg-white/10 disabled:opacity-40 ${pipWindow || pipFloat ? "text-[#00e6e6]" : "text-gray-300"}`}
        >
          <MdPictureInPictureAlt size={18} />
        </button>
        )}
        {!fullscreen && <PlayerVolume />}
        <button type="button" aria-label={expanded ? "Minimize video" : "Expand video"} title={expanded ? "Minimize video" : "Expand video"} onClick={toggleExpanded} disabled={dataSaver || audioOnly} className={expanded && !dataSaver && !audioOnly ? "rounded-full bg-black/60 p-2 text-white hover:bg-white/10 disabled:opacity-40" : "rounded-full p-2 text-gray-300 hover:bg-white/10 disabled:opacity-40"}>{expanded ? <FiMinimize2 /> : <FiMaximize2 />}</button>
        <button
          type="button"
          aria-label="Close YouTube player"
          title="Close YouTube player"
          onClick={() => {
            closePictureInPicture();
            setExpanded(false);
            dispatch(setFullScreen(false));
            dispatch(setYoutubeVideo(null));
          }}
          className={expanded && !dataSaver && !audioOnly ? "rounded-full bg-black/60 p-2 text-gray-300 transition hover:bg-white/10 hover:text-white" : "rounded-full p-2 text-gray-300 transition hover:bg-white/10 hover:text-white"}
        >
          <FiX size={18} />
        </button>
        {showDesktopQueue && !fullscreen && (
          <div className="absolute bottom-full right-0 z-30 mb-2 w-[min(92vw,360px)] rounded-xl border border-white/10 bg-[#07121d] p-3 shadow-2xl">
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[#00e6e6]">Next up</p>
            <div className="max-h-72 overflow-y-auto">
              {upcoming.length === 0 && <p className="px-1 py-3 text-xs text-gray-400">Queue is empty.</p>}
              {upcoming.slice(0, 12).map((item) => (
                <button key={item.id} type="button" onClick={() => playQueueItem(item)} className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-white/10"><img src={item.thumbnail} alt="" className="h-9 w-9 rounded object-cover" /><span className="truncate text-xs text-white">{item.title}</span></button>
              ))}
            </div>
            <form onSubmit={handleAddSearch} className="mt-3 flex items-center gap-2 border-t border-white/10 pt-3">
              <input
                type="text"
                value={addQuery}
                onChange={(event) => setAddQuery(event.target.value)}
                placeholder="Add a song to queue..."
                className="min-w-0 flex-1 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white outline-none focus:border-[#00e6e6]"
              />
              <button type="submit" aria-label="Search" disabled={addSearching} className="shrink-0 rounded-md bg-white/10 p-1.5 text-gray-200 hover:bg-white/20 disabled:opacity-50">
                <FiSearch className="h-4 w-4" />
              </button>
            </form>
            {addResults.length > 0 && (
              <div className="mt-2 max-h-40 overflow-y-auto">
                {addResults.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 rounded-lg p-2 hover:bg-white/10">
                    <img src={item.thumbnail} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
                    <span className="min-w-0 flex-1 truncate text-xs text-white">{item.title}</span>
                    <button type="button" aria-label={`Add ${item.title} to queue`} onClick={() => handleAddTrack(item)} className="shrink-0 rounded-full bg-[#00e6e6]/20 p-1 text-[#00e6e6] hover:bg-[#00e6e6]/30">
                      <FiPlus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      </div>
      {showDesktopQueue && fullscreen && (
        <div className="yt-queue-panel">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[#00e6e6]">Next up</p>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {upcoming.length === 0 && <p className="px-1 py-3 text-xs text-gray-400">Queue is empty.</p>}
            {upcoming.slice(0, 12).map((item) => (
              <button key={item.id} type="button" onClick={() => playQueueItem(item)} className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-white/10"><img src={item.thumbnail} alt="" className="h-9 w-9 rounded object-cover" /><span className="truncate text-xs text-white">{item.title}</span></button>
            ))}
          </div>
        </div>
      )}
      {fullscreen && isMobile && !mobileSheet && (
        <p className="pointer-events-none absolute inset-x-0 bottom-28 z-20 text-center text-[11px] uppercase tracking-[0.2em] text-white/55">Swipe up for lyrics and queue</p>
      )}
      {showMobileSheet && (
        <div className="yt-mobile-sheet">
          <div className="yt-mobile-sheet-handle" />
          <div className="mb-3 flex gap-2">
            <button type="button" onClick={() => setSheetTab("queue")} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${sheetTab === "queue" ? "bg-[#00e6e6] text-black" : "bg-white/10 text-gray-300"}`}>Queue</button>
            <button type="button" onClick={() => setSheetTab("lyrics")} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${sheetTab === "lyrics" ? "bg-[#00e6e6] text-black" : "bg-white/10 text-gray-300"}`}>Lyrics</button>
            <button type="button" aria-label="Show video" onClick={() => { setMobileSheet(false); setShowQueue(false); setShowLyrics(false); }} className="ml-auto text-xs text-gray-400">Swipe down</button>
          </div>
          {sheetTab === "queue" ? (
            <div className="min-h-0 flex-1 overflow-y-auto">
              {upcoming.length === 0 && <p className="py-6 text-center text-sm text-gray-400">Queue is empty.</p>}
              {upcoming.map((item) => (
                <button key={item.id} type="button" onClick={() => playQueueItem(item)} className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-white/10">
                  <img src={item.thumbnail} alt="" className="h-11 w-11 rounded object-cover" />
                  <span className="min-w-0 flex-1 truncate text-sm text-white">{item.title}</span>
                </button>
              ))}
            </div>
          ) : (
            <SyncedLyrics
              title={video.title}
              artist={video.channel}
              duration={duration}
              currentTime={currentTime}
              onSeek={seekOnCurrentTrack}
              className="min-h-0 flex-1"
            />
          )}
        </div>
      )}
      {showLyrics && syncedLyrics !== false && !isMobile && (
        <div className={fullscreen ? "lyrics-panel lyrics-panel--expanded" : "lyrics-panel"}>
          <button
            type="button"
            aria-label="Close lyrics"
            onClick={() => setShowLyrics(false)}
            className="absolute right-3 top-3 z-10 rounded-full p-1.5 text-gray-400 hover:bg-white/10 hover:text-white"
          >
            <FiX size={16} />
          </button>
          <SyncedLyrics
            title={video.title}
            artist={video.channel}
            duration={duration}
            currentTime={currentTime}
            onSeek={seekOnCurrentTrack}
          />
        </div>
      )}
      {pipWindow && pipMountRef.current && !isMobile && (
        <PictureInPictureWindow
          container={pipMountRef.current}
          video={video}
          currentTime={currentTime}
          duration={duration}
          isPlaying={isPlaying}
          lines={lyricsQuery.lines}
          queue={upcoming}
          onPlayPause={handlePlayPause}
          onSeekBy={seekBy}
          onNext={() => handleNext()}
          onSelect={playQueueItem}
          onClose={closePictureInPicture}
        />
      )}
    </div>
  );
}

