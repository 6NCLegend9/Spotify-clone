"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import Link from "next/link";
import { youtubePlaybackError } from "@/utils/youtubePlaybackError.mjs";
import PlayerDock from "./PlayerDock";
import { nextQueueTrack, shuffleUpcoming } from "@/utils/playerQueue.mjs";
import { useDispatch, useSelector } from "react-redux";
import { useSession } from "next-auth/react";
import {
  playPause,
  setYoutubeVideo,
  setYoutubeQueue,
  setFullScreen,
  addToQueue,
  appendToQueue,
  setPlaybackPosition,
  editQueue,
  undoQueueEdit,
  expireQueueUndo,
  startYoutubePlayback,
} from "@/redux/features/playerSlice";
import { createPlaylist } from "@/services/playlistApi";
import useSleepTimer from "@/hooks/useSleepTimer";
import useListeningInsights from "@/hooks/useListeningInsights";
import { recordDiagnostic } from "@/utils/diagnostics.mjs";
const QueueEditor = dynamic(() => import("./QueueEditor"), { ssr: false });
import { FiChevronDown, FiChevronUp, FiPause, FiPlay, FiPlus, FiRotateCcw, FiRotateCw, FiSearch, FiSkipBack, FiSkipForward, FiSquare, FiX, FiMaximize2, FiMinimize2 } from "react-icons/fi";
import { MdOutlineLyrics } from "react-icons/md";
import FavouriteTrackButton from "@/components/FavouriteTrackButton";
import AddToPlaylistButton from "@/components/AddToPlaylistButton";
const SyncedLyrics = dynamic(() => import("@/components/MusicPlayer/SyncedLyrics"), { ssr: false });
const PictureInPictureWindow = dynamic(() => import("@/components/MusicPlayer/PictureInPictureWindow"), { ssr: false });
const FloatingPlayer = dynamic(() => import("./FloatingPlayer"), { ssr: false });
import PlayerVolume from "@/components/MusicPlayer/PlayerVolume";
import { useJam } from "@/components/Jam/JamProvider";
import useSyncedLyrics from "@/hooks/useSyncedLyrics";
import { requestJson } from "@/services/http";
import { useIsPhoneViewport, useMediaQuery } from "@/hooks/useMediaQuery";
import { useDismissOnOutside } from "@/hooks/useDismissOnOutside";
import { bandsForPreset, youtubePlaybackVolume } from "@/utils/eqPresets";
import { THUMB_FALLBACK } from "@/utils/imageOptimize";
import {
  DESKTOP_PREV_EVENT,
  DESKTOP_SKIP_EVENT,
  JAM_AUX_SKIP_EVENT,
  JAM_PLAYBACK_STATE_EVENT,
  JAM_REMOTE_PLAYBACK_EVENT,
  JAM_REMOTE_SEEK_EVENT,
} from "@/utils/jam.mjs";
import { decodeTrackFields } from "@/utils/text";
import { pickOneMoreTrack, shouldOfferOneMore } from "@/utils/oneMoreSong.mjs";
import useYoutubeCaptions from "@/hooks/useYoutubeCaptions";
const CaptionKaraoke = dynamic(() => import("./CaptionKaraoke"), { ssr: false });
const OneMoreSongCard = dynamic(() => import("./OneMoreSongCard"), { ssr: false });

const handleThumbError = (event) => {
  if (event.currentTarget.src !== THUMB_FALLBACK) {
    event.currentTarget.src = THUMB_FALLBACK;
  }
};

const safeMediaTime = (value) => {
  const next = Number(value);
  return Number.isFinite(next) && next >= 0 ? next : 0;
};

const formatTime = (seconds) => {
  const value = Math.floor(safeMediaTime(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
};

const otherDeck = (key) => (key === "A" ? "B" : "A");
const CHROME_IDLE_MS = 10000;
const SEEK_GUARD_MS = 5000;
const TRACK_CHANGE_GUARD_MS = 8000;
const ACTIVE_BUFFER_RECOVERY_MS = 4500;
const HEALTHY_PLAYBACK_RESET_MS = 12000;
const PRELOAD_START_DELAY_MS = 10000;
const STALL_NUDGE_MS = 3000;
const STALL_RELOAD_MS = 7000;
const INCOMING_STALL_MS = 1000;
const VERIFIED_ADVANCE_SECONDS = 0.2;
const STARTUP_GRACE_MS = 12000;
const MAX_SAFE_YOUTUBE_CROSSFADE_SECONDS = 6;
// Skips should still feel instant, so cap the outgoing ramp well below the configured fade length.
const MAX_SKIP_FADE_SECONDS = 1;
const STREAMING_QUALITY_PREFERENCES = {
  auto: "default",
  low: "medium",
  normal: "large",
  high: "hd720",
  "very-high": "hd1080",
};
const YOUTUBE_QUALITY_LABELS = {
  tiny: "144p",
  small: "240p",
  medium: "360p",
  large: "480p",
  hd720: "720p",
  hd1080: "1080p",
  highres: "High resolution",
};

function resolveYouTubeQuality(videoQuality, streamingQuality, dataSaver) {
  if (videoQuality === "1080p") return "hd1080";
  if (videoQuality === "720p") return "hd720";
  if (dataSaver) return "medium";
  if (streamingQuality === "very-high") return "hd1080";
  if (streamingQuality === "high") return "hd720";
  // On desktop or fast connections with automatic quality settings, escalate to maximum fidelity.
  if (typeof window !== "undefined" && !dataSaver) {
    const isDesktop = window.innerWidth >= 1024;
    const isFast = typeof navigator !== "undefined" && navigator.connection?.effectiveType === "4g";
    if (isDesktop || isFast) return "hd1080";
  }
  return STREAMING_QUALITY_PREFERENCES[streamingQuality]
    || STREAMING_QUALITY_PREFERENCES.auto;
}

function requestYouTubeQuality(player, preferredQuality) {
  if (preferredQuality !== "default") player?.setPlaybackQuality?.(preferredQuality);
}

function applyYouTubeCaptions(player, enabled) {
  if (!player) return;
  try {
    if (enabled) player.loadModule?.("captions");
    else player.unloadModule?.("captions");
  } catch {
    // Captions are only available when YouTube exposes them for the video.
  }
}

function isEditableKeyboardTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function isActionKeyboardTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      "button, a, [role='button'], [role='link'], [role='menuitem'], [role='option'], [role='tab'], [role='switch'], summary",
    ),
  );
}

// Best-effort signal for recommendations.js's skip exclusion filter; never blocks playback.
const recordPlayEvent = (id, event) => {
  if (!id) return;
  fetch("/api/playEvent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, event }),
  }).catch(() => {});
};

function YouTubePlayer() {
  const dispatch = useDispatch();
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const repeatRef = useRef(false);
  const unshuffledRef = useRef([]);
  repeatRef.current = repeat;
  const { status } = useSession();
  const jam = useJam();
  const { youtubeVideo: rawVideo, youtubeQueue: rawQueue, isPlaying, restorePosition, playbackOwner, queueUndo, queueManualEnd, queueMode } = useSelector(
    (state) => state.player,
  );
  const video = useMemo(() => decodeTrackFields(rawVideo), [rawVideo]);
  const queue = useMemo(
    () => (Array.isArray(rawQueue) ? rawQueue.map((item) => decodeTrackFields(item)) : []),
    [rawQueue],
  );
  const {
    dataSaver,
    audioOnly: audioOnlyToggle,
    videoQuality,
    streamingQuality,
    eqPreset,
    eqBands,
    normalization,
    syncedLyrics,
    pictureInPicture,
    masterVolume,
    keyboardShortcuts,
    captions,
    fadeEnabled,
    fadeSeconds,
    privateSession,
    listeningInsights,
    owner: settingsOwner,
  } = useSelector((state) => state.settings);
  const transitionMode = "off";
  const crossfadeSeconds = 0;
  const isPhone = useIsPhoneViewport();
  const isNarrow = useMediaQuery("(max-width: 1179px)");
  const isLandscape = useMediaQuery("(orientation: landscape)");
  const isShortViewport = useMediaQuery("(max-height: 540px)");
  const isPhoneRef = useRef(isPhone);
  isPhoneRef.current = isPhone;
  const videoId = video?.id || "";
  const playbackVolume = youtubePlaybackVolume(bandsForPreset(eqPreset, eqBands), normalization);
  // "Audio only" can be set via the dedicated toggle or the Video quality dropdown; either should hide video.
  const audioOnly = audioOnlyToggle || videoQuality === "audio-only";
  const captionsEnabled = captions !== false;
  const letterShortcutsEnabled = keyboardShortcuts !== false;
  const requestedYouTubeQuality = resolveYouTubeQuality(
    videoQuality,
    streamingQuality,
    dataSaver,
  );
  const isJamGuest = jam?.role === "guest" && Boolean(jam.code);
  const jamLocked = isJamGuest && jam?.hasAux !== true;
  const sleep = useSleepTimer({
    owner: playbackOwner, trackId: videoId, enabled: false,
    onExpire: () => {
      userPausedRef.current = true;
      isPlayingRef.current = false;
      trackChangeUntilRef.current = 0;
      abortCrossfade();
      cancelFade();
      for (const deck of Object.values(deckPlayerRefs)) deck.current?.pauseVideo?.();
      dispatch(playPause(false));
    },
  });
  const insights = useListeningInsights({
    owner: playbackOwner, trackId: videoId,
    enabled: status === "authenticated" && settingsOwner === playbackOwner && listeningInsights === true && !privateSession && !jam?.code,
    getSample: () => {
      const player = getActivePlayer();
      return { position: player?.getCurrentTime?.(), playing: player?.getPlayerState?.() === window.YT?.PlayerState?.PLAYING && isPlayingRef.current };
    },
  });
  const manualEndRef = useRef(queueManualEnd);
  manualEndRef.current = queueManualEnd;
  useEffect(() => {
    if (!queueUndo) return;
    const timer = setTimeout(() => dispatch(expireQueueUndo()), Math.max(0, queueUndo.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [dispatch, queueUndo]);
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
  const pendingJamSeekRef = useRef(null);
  const pendingJamPlaybackRef = useRef(null);
  const lastJamPlaybackReportRef = useRef(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [apiReady, setApiReady] = useState(false);
  const [deliveredVideoQuality, setDeliveredVideoQuality] = useState("");
  const [showQueue, setShowQueue] = useState(false);
  const queueMenuRef = useRef(null);
  const queuePanelRef = useRef(null);
  const lyricsPanelRef = useRef(null);
  const sheetRef = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const immersiveRef = useRef(false);
  const toggleExpandedRef = useRef(() => {});
  const videoTapRef = useRef({ x: 0, y: 0, active: false });
  const [chromeVisible, setChromeVisible] = useState(true);
  const expandLockRef = useRef(false);
  const pendingLyricsSheetRef = useRef(false);
  const chromeVisibleRef = useRef(true);
  const chromePinnedRef = useRef(false);
  const chromeLockedRef = useRef(false);
  const chromeIdleTimerRef = useRef(0);
  const chromeHideGenRef = useRef(0);
  const bumpExpandedChromeRef = useRef(() => {});
  const userPausedRef = useRef(false);
  const pageHiddenWhilePlayingRef = useRef(false);
  const trackChangeUntilRef = useRef(0);
  const [playerError, setPlayerError] = useState(null);
  const [addQuery, setAddQuery] = useState("");
  const [addResults, setAddResults] = useState([]);
  const [addSearching, setAddSearching] = useState(false);
  const [addSearchError, setAddSearchError] = useState("");
  const [oneMoreArmed, setOneMoreArmed] = useState(false);
  const [oneMoreSuggestion, setOneMoreSuggestion] = useState(null);
  const [oneMorePrefetch, setOneMorePrefetch] = useState(null);
  const [mediaTheater, setMediaTheater] = useState(false);
  const oneMoreArmedRef = useRef(false);
  const oneMoreSuggestionRef = useRef(null);
  const oneMorePrefetchRef = useRef(null);
  const karaokeHasLinesRef = useRef(false);
  const karaokeSurface = Boolean(mediaTheater || (expanded && !dataSaver && !audioOnly));
  const karaokeLines = useYoutubeCaptions(videoId, karaokeSurface && captionsEnabled);
  const karaokeHasLines = karaokeLines.length > 0;
  karaokeHasLinesRef.current = karaokeHasLines;
  oneMoreArmedRef.current = oneMoreArmed;
  oneMoreSuggestionRef.current = oneMoreSuggestion;
  oneMorePrefetchRef.current = oneMorePrefetch;
  const autoExtendingRef = useRef(false);
  const lastExtendEmptyRef = useRef(false);
  const lastExtendAtRef = useRef(0);
  const extendQueueRef = useRef(async () => []);
  const playNextOrContinueRef = useRef(() => {});
  const pipWindowRef = useRef(null);
  const pipMountRef = useRef(null);
  const [showLyrics, setShowLyrics] = useState(false);
  const [mobileSheet, setMobileSheet] = useState(false);
  const [sheetTab, setSheetTab] = useState("lyrics");
  const swipeStartYRef = useRef(null);
  const [pipWindow, setPipWindow] = useState(null);
  const [pipFloat, setPipFloat] = useState(false);
  const videoRef = useRef(video);
  const queueRef = useRef(queue);
  const isPlayingRef = useRef(isPlaying);
  const savedProgressRef = useRef({ id: null, position: 0 });
  const isJamGuestRef = useRef(isJamGuest);
  const jamRef = useRef(jam);
  const seekGuardRef = useRef({ seeking: false, until: 0, target: null, videoId: null });
  const skipCrossfadeVideoRef = useRef(null);
  const nearEndStreakRef = useRef(0);
  const endFadeVideoRef = useRef(null);
  const preloadedIdRef = useRef(null);
  const preloadingRef = useRef(null);
  const preloadNextRef = useRef(() => {});
  const preloadRetryAtRef = useRef(0);
  const preloadPollTimerRef = useRef(null);
  const activeBufferTimerRef = useRef(null);
  const fadeTimerRef = useRef(null);
  const healthyPlaybackTimerRef = useRef(null);
  const activeRecoveryRef = useRef({
    videoId: null,
    attempts: 0,
    lastAttemptAt: 0,
    lastTime: 0,
    lastAdvancedAt: 0,
    healthySince: 0,
  });
  const incomingProgressRef = useRef({
    id: null,
    key: null,
    generation: 0,
    lastTime: -1,
    lastAdvancedAt: 0,
  });
  const activeTrackStartedRef = useRef({ videoId: null, startedAt: 0 });
  const handoffTimerRef = useRef(null);
  const handoffWaitingRef = useRef(null);
  const endedTransitionRef = useRef(null);
  videoRef.current = video;
  const safeQueue = useMemo(
    () => (Array.isArray(queue) ? queue.filter((item) => item?.id) : []),
    [queue],
  );
  queueRef.current = safeQueue;
  isPlayingRef.current = isPlaying;
  isJamGuestRef.current = isJamGuest;
  jamRef.current = jam;
  chromeLockedRef.current = Boolean(playerError || mobileSheet);
  const lyricsQuery = useSyncedLyrics({
    title: video?.title || "",
    artist: video?.channel || "",
    duration,
    enabled: Boolean(video?.title) && syncedLyrics !== false,
  });

  const getActivePlayer = () => deckPlayerRefs[activeDeckRef.current]?.current;

  const reportPlaybackQuality = (player, key) => {
    if (key !== activeDeckRef.current) return;
    const quality = player?.getPlaybackQuality?.();
    if (quality) {
      setDeliveredVideoQuality((current) => (current === quality ? current : quality));
    }
  };

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

  const markExpectPlaying = () => {
    userPausedRef.current = false;
    trackChangeUntilRef.current = performance.now() + TRACK_CHANGE_GUARD_MS;
  };

  const wantsPlayback = () =>
    !userPausedRef.current &&
    (isPlayingRef.current || performance.now() < trackChangeUntilRef.current);

  const isPageHidden = () =>
    typeof document !== "undefined" && document.visibilityState === "hidden";

  const markBackgroundPlayback = () => {
    if (!userPausedRef.current) pageHiddenWhilePlayingRef.current = true;
  };

  const resumePlayer = (player) => {
    if (sleep.check()) return;
    if (isPageHidden()) {
      markBackgroundPlayback();
      return;
    }
    if (!player?.playVideo) return;
    try {
      player.unMute?.();
      applyPlaybackVolume(player);
      player.playVideo();
    } catch (error) {
      // Player may still be mounting the next video.
    }
  };

  const markSeek = (time, dragging = false) => {
    seekGuardRef.current = {
      seeking: dragging,
      until: performance.now() + SEEK_GUARD_MS,
      target: time,
      videoId: videoRef.current?.id || null,
    };
    nearEndStreakRef.current = 0;
    const recovery = activeRecoveryRef.current;
    if (recovery.videoId === videoRef.current?.id) {
      recovery.lastTime = time;
      recovery.lastAdvancedAt = performance.now();
      recovery.healthySince = 0;
    }
  };

  const getNextVideo = () => {
    const currentId = videoRef.current?.id;
    if (!currentId) return null;
    const list = Array.isArray(queueRef.current) ? queueRef.current : [];
    return nextQueueTrack(list, currentId, repeatRef.current);
  };

  const getPreviousVideo = () => {
    const currentId = videoRef.current?.id;
    if (!currentId) return null;
    const list = Array.isArray(queueRef.current) ? queueRef.current : [];
    const index = list.findIndex((item) => item?.id === currentId);
    if (index <= 0) return null;
    return list.slice(0, index).reverse().find((item) => item?.id) || null;
  };

  const hushIdleDeck = () => {
    abortCrossfade();
    const idle = deckPlayerRefs[otherDeck(activeDeckRef.current)].current;
    if (preloadingRef.current || preloadedIdRef.current) {
      cancelIdlePreload(1000);
    }
    try {
      idle?.mute?.();
      idle?.setVolume?.(0);
      idle?.pauseVideo?.();
    } catch (error) {
      // Idle deck may already be gone.
    }
    setFadeProgress(0);
  };

  const isRealTrackEnd = (player) => {
    if (!player || isSeekGuarded()) return false;
    const id = playerVideoId(player);
    const want = videoRef.current?.id;
    if (want && id && id !== want) return false;
    const endedAt = player.getCurrentTime?.() || 0;
    const endedDur = player.getDuration?.() || 0;
    return endedDur > 8 && endedAt >= endedDur - 1.1;
  };

  const applyPlaybackVolume = (player, ratio = 1) => {
    const master = Number.isFinite(masterVolume) ? masterVolume : 0.85;
    player?.setVolume?.(Math.round(playbackVolume * master * ratio));
  };

  // Fade-in/out is a simple volume ramp on the active player; it never touches deck/crossfade logic.
  const cancelFade = () => {
    if (fadeTimerRef.current) {
      window.clearInterval(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }
  };

  const rampVolume = (player, fromRatio, toRatio, options = {}) => {
    cancelFade();
    const { durationMs: overrideMs, onDone } = options;
    const durationMs = Number.isFinite(overrideMs)
      ? overrideMs
      : Math.max(0, (Number(fadeSeconds) || 0) * 1000);
    if (fadeEnabled === false || durationMs < 50 || !player) {
      applyPlaybackVolume(player, toRatio);
      onDone?.();
      return;
    }
    const steps = Math.max(1, Math.round(durationMs / 40));
    let step = 0;
    applyPlaybackVolume(player, fromRatio);
    fadeTimerRef.current = window.setInterval(() => {
      step += 1;
      const progress = Math.min(1, step / steps);
      applyPlaybackVolume(player, fromRatio + (toRatio - fromRatio) * progress);
      if (progress >= 1) {
        cancelFade();
        onDone?.();
      }
    }, 40);
  };

  const emptyRecovery = (videoId = null) => ({
    videoId,
    attempts: 0,
    lastAttemptAt: 0,
    lastTime: 0,
    lastAdvancedAt: videoId ? performance.now() : 0,
    healthySince: 0,
  });

  const markPreloaded = (videoId, key) => {
    if (!videoId || !key) {
      preloadedIdRef.current = null;
      return;
    }
    preloadedIdRef.current = {
      id: videoId,
      key,
      generation: deckGenerationRef.current[key],
    };
  };

  const isPreloadedFor = (videoId, key = null) => {
    const token = preloadedIdRef.current;
    if (!token?.id || token.id !== videoId) return false;
    if (key && token.key !== key) return false;
    if (deckGenerationRef.current[token.key] !== token.generation) return false;
    return playerVideoId(deckPlayerRefs[token.key].current) === videoId;
  };

  const noteIncomingProgress = (key, player) => {
    const id = playerVideoId(player);
    const time = Number(player?.getCurrentTime?.() || 0);
    const generation = deckGenerationRef.current[key];
    const prev = incomingProgressRef.current;
    const now = performance.now();
    if (prev.id !== id || prev.key !== key || prev.generation !== generation) {
      incomingProgressRef.current = {
        id,
        key,
        generation,
        lastTime: time,
        lastAdvancedAt: time > 0.05 ? now : 0,
      };
      return incomingProgressRef.current;
    }
    if (time > prev.lastTime + 0.08) {
      prev.lastTime = time;
      prev.lastAdvancedAt = now;
    }
    return prev;
  };

  const isVerifiedIncoming = (
    key,
    player,
    videoId,
    { minAdvance = VERIFIED_ADVANCE_SECONDS, maxStallMs = INCOMING_STALL_MS } = {},
  ) => {
    if (!player || !videoId || !key) return false;
    if (playerVideoId(player) !== videoId) return false;
    if (player.getPlayerState?.() !== window.YT?.PlayerState?.PLAYING) return false;
    const progress = noteIncomingProgress(key, player);
    const now = performance.now();
    return (
      progress.id === videoId &&
      progress.key === key &&
      progress.generation === deckGenerationRef.current[key] &&
      progress.lastTime >= minAdvance &&
      progress.lastAdvancedAt > 0 &&
      now - progress.lastAdvancedAt <= maxStallMs
    );
  };

  const isActivePlaybackHealthy = () => {
    const key = activeDeckRef.current;
    const player = deckPlayerRefs[key].current;
    const want = videoRef.current?.id;
    if (!player || !want || playerVideoId(player) !== want) return false;
    if (player.getPlayerState?.() !== window.YT?.PlayerState?.PLAYING) return false;
    const started = activeTrackStartedRef.current;
    const recovery = activeRecoveryRef.current;
    const now = performance.now();
    return (
      started.videoId === want &&
      started.startedAt > 0 &&
      now - started.startedAt >= PRELOAD_START_DELAY_MS &&
      recovery.videoId === want &&
      recovery.lastTime >= 2 &&
      recovery.lastAdvancedAt > 0 &&
      now - recovery.lastAdvancedAt <= 1500
    );
  };

  const clearPreloadTimers = () => {
    if (preloadPollTimerRef.current) {
      window.clearInterval(preloadPollTimerRef.current);
      preloadPollTimerRef.current = null;
    }
  };

  const cancelIdlePreload = (backoffMs = 3000) => {
    clearPreloadTimers();
    preloadedIdRef.current = null;
    preloadingRef.current = null;
    preloadRetryAtRef.current = performance.now() + backoffMs;
    const idle = deckPlayerRefs[otherDeck(activeDeckRef.current)].current;
    try {
      idle?.mute?.();
      idle?.setVolume?.(0);
      idle?.pauseVideo?.();
    } catch (error) {
      // Idle deck may already be gone.
    }
  };

  const clearActiveBufferTimers = () => {
    if (activeBufferTimerRef.current) {
      window.clearTimeout(activeBufferTimerRef.current);
      activeBufferTimerRef.current = null;
    }
    if (healthyPlaybackTimerRef.current) {
      window.clearTimeout(healthyPlaybackTimerRef.current);
      healthyPlaybackTimerRef.current = null;
    }
  };

  const resetActiveRecovery = (videoId = null) => {
    clearActiveBufferTimers();
    activeRecoveryRef.current = emptyRecovery(videoId);
  };

  const markActivePlaybackHealthy = (key, player, generation) => {
    if (activeBufferTimerRef.current) {
      window.clearTimeout(activeBufferTimerRef.current);
      activeBufferTimerRef.current = null;
    }
    if (healthyPlaybackTimerRef.current) {
      window.clearTimeout(healthyPlaybackTimerRef.current);
    }
    const videoId = playerVideoId(player);
    const time = player.getCurrentTime?.() || 0;
    const recovery = activeRecoveryRef.current;
    if (recovery.videoId === videoId && time > (recovery.lastTime || 0) + 0.08) {
      recovery.lastTime = time;
      recovery.lastAdvancedAt = performance.now();
      if (!recovery.healthySince) recovery.healthySince = recovery.lastAdvancedAt;
    }
    healthyPlaybackTimerRef.current = window.setTimeout(() => {
      healthyPlaybackTimerRef.current = null;
      const latest = activeRecoveryRef.current;
      if (
        activeDeckRef.current === key &&
        deckGenerationRef.current[key] === generation &&
        deckPlayerRefs[key].current === player &&
        playerVideoId(player) === videoId &&
        player.getPlayerState?.() === window.YT?.PlayerState?.PLAYING &&
        latest.videoId === videoId &&
        latest.lastAdvancedAt > 0 &&
        performance.now() - latest.lastAdvancedAt <= 1500
      ) {
        activeRecoveryRef.current = {
          ...emptyRecovery(videoId),
          lastTime: latest.lastTime,
          lastAdvancedAt: latest.lastAdvancedAt,
          healthySince: latest.healthySince || performance.now(),
        };
      }
    }, HEALTHY_PLAYBACK_RESET_MS);
  };

  const scheduleActiveBufferRecovery = (key, player, generation) => {
    if (isPageHidden()) {
      markBackgroundPlayback();
      return;
    }
    if (
      crossfadeInProgressRef.current ||
      isSeekGuarded() ||
      !isPlayingRef.current ||
      activeDeckRef.current !== key ||
      deckGenerationRef.current[key] !== generation ||
      deckPlayerRefs[key].current !== player
    ) {
      return;
    }

    const videoId = playerVideoId(player);
    if (!videoId || (videoRef.current?.id && videoRef.current.id !== videoId)) return;
    cancelIdlePreload(3000);
    if (healthyPlaybackTimerRef.current) {
      window.clearTimeout(healthyPlaybackTimerRef.current);
      healthyPlaybackTimerRef.current = null;
    }
    if (activeRecoveryRef.current.videoId !== videoId) {
      activeRecoveryRef.current = emptyRecovery(videoId);
    }
    if (activeBufferTimerRef.current) return;

    const now = performance.now();
    const activeTrack = activeTrackStartedRef.current;
    const recentlyStarted =
      activeTrack.videoId === videoId &&
      activeTrack.startedAt &&
      now - activeTrack.startedAt < STARTUP_GRACE_MS;
    const retryGraceMs = Math.max(
      0,
      1500 - (now - activeRecoveryRef.current.lastAttemptAt),
    );
    const recoveryDelay = Math.max(
      retryGraceMs,
      recentlyStarted ? 1500 : ACTIVE_BUFFER_RECOVERY_MS,
    );
    activeBufferTimerRef.current = window.setTimeout(() => {
      activeBufferTimerRef.current = null;
      if (
        crossfadeInProgressRef.current ||
        isSeekGuarded() ||
        !isPlayingRef.current ||
        activeDeckRef.current !== key ||
        deckGenerationRef.current[key] !== generation ||
        deckPlayerRefs[key].current !== player ||
        playerVideoId(player) !== videoId
      ) {
        return;
      }

      const state = player.getPlayerState?.();
      const time = player.getCurrentTime?.() || 0;
      const recovery = activeRecoveryRef.current.videoId === videoId
        ? activeRecoveryRef.current
        : emptyRecovery(videoId);
      if (activeRecoveryRef.current.videoId !== videoId) {
        activeRecoveryRef.current = recovery;
      }
      const stalledClock =
        !recovery.lastAdvancedAt ||
        performance.now() - recovery.lastAdvancedAt >= STALL_NUDGE_MS;
      const recoverable =
        state === window.YT?.PlayerState?.BUFFERING ||
        (
          stalledClock &&
          (
            state === window.YT?.PlayerState?.PLAYING ||
            state === window.YT?.PlayerState?.CUED ||
            state === window.YT?.PlayerState?.UNSTARTED ||
            state === window.YT?.PlayerState?.PAUSED
          )
        );
      if (!recoverable) return;

      const stillStarting =
        (activeTrackStartedRef.current.videoId === videoId &&
          activeTrackStartedRef.current.startedAt &&
          performance.now() - activeTrackStartedRef.current.startedAt < STARTUP_GRACE_MS) ||
        time < 1.5;
      if (stillStarting) {
        player.unMute?.();
        applyPlaybackVolume(player);
        player.playVideo?.();
        return;
      }

      const attempts = recovery.attempts;
      if (attempts >= 2) {
        setPlayerError({
          kind: "playback",
          message: "This video stopped buffering. Retry playback or skip to the next track.",
        });
        dispatch(playPause(false));
        return;
      }

      activeRecoveryRef.current = {
        ...recovery,
        videoId,
        attempts: attempts + 1,
        lastAttemptAt: performance.now(),
        healthySince: 0,
      };
      const resumeAt = Math.max(0, time - 0.15);
      player.unMute?.();
      applyPlaybackVolume(player);
      player.loadVideoById?.({ videoId, startSeconds: resumeAt });
      player.playVideo?.();
    }, recoveryDelay);
  };

  const watchActiveProgress = (key, player, generation) => {
    if (isPageHidden()) {
      markBackgroundPlayback();
      return;
    }
    if (
      crossfadeInProgressRef.current ||
      isSeekGuarded() ||
      !isPlayingRef.current ||
      activeDeckRef.current !== key ||
      !player
    ) {
      return;
    }
    const videoId = playerVideoId(player);
    const want = videoRef.current?.id;
    if (!videoId || (want && videoId !== want)) return;
    const time = player.getCurrentTime?.() || 0;
    const dur = player.getDuration?.() || 0;
    const now = performance.now();
    if (activeRecoveryRef.current.videoId !== videoId) {
      activeRecoveryRef.current = {
        ...emptyRecovery(videoId),
        lastTime: time,
        lastAdvancedAt: now,
      };
      return;
    }
    const recovery = activeRecoveryRef.current;
    if (time > (recovery.lastTime || 0) + 0.08) {
      recovery.lastTime = time;
      recovery.lastAdvancedAt = now;
      if (!recovery.healthySince) recovery.healthySince = now;
      if (now - recovery.healthySince >= HEALTHY_PLAYBACK_RESET_MS) {
        recovery.attempts = 0;
      }
      return;
    }
    recovery.healthySince = 0;
    if (dur > 8 && time >= dur - 1.5) return;
    const stalledFor = now - (recovery.lastAdvancedAt || now);
    if (stalledFor < STALL_NUDGE_MS) return;
    cancelIdlePreload(3000);
    if (stalledFor < STALL_RELOAD_MS) {
      player.unMute?.();
      applyPlaybackVolume(player);
      player.playVideo?.();
      return;
    }
    scheduleActiveBufferRecovery(key, player, generation);
  };

  const destroyDeck = (key) => {
    deckGenerationRef.current[key] += 1;
    const player = deckPlayerRefs[key].current;
    deckPlayerRefs[key].current = null;
    player?.destroy?.();
    deckHostRefs[key].current?.replaceChildren();
  };

  const stopFadeTimers = () => {
    clearPreloadTimers();
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
    if (handoffTimerRef.current) {
      window.clearTimeout(handoffTimerRef.current);
      handoffTimerRef.current = null;
    }
    handoffWaitingRef.current = null;
    crossfadeInProgressRef.current = false;
    pendingNextRef.current = null;
    setFadeProgress(0);
  };

  const cancelCrossfade = () => {
    stopFadeTimers();
    preloadedIdRef.current = null;
    preloadingRef.current = null;
  };

  // Abandons an in-flight fade so a manual pause/seek never leaves a second deck audibly playing.
  const abortCrossfade = () => {
    if (!crossfadeInProgressRef.current) return;
    cancelCrossfade();
    destroyDeck(otherDeck(activeDeckRef.current));
    const active = getActivePlayer();
    active?.unMute?.();
    applyPlaybackVolume(active);
    if (isPlayingRef.current) active?.playVideo?.();
  };

  const recoverFromIncomingFailure = (failedKey) => {
    if (failedKey === activeDeckRef.current) return;
    const waiting = handoffWaitingRef.current;
    if (crossfadeInProgressRef.current) stopFadeTimers();
    preloadedIdRef.current = null;
    preloadingRef.current = null;
    destroyDeck(failedKey);
    if (waiting?.incomingKey === failedKey && waiting.nextVideo) {
      hardSwitchOnDeck(waiting.outgoingKey, waiting.nextVideo);
      return;
    }
    const outgoing = getActivePlayer();
    outgoing?.unMute?.();
    applyPlaybackVolume(outgoing);
    if (isPlayingRef.current) outgoing?.playVideo?.();
  };

  const hardSwitchOnDeck = (
    key,
    nextVideo,
    { recordCompletion = true } = {},
  ) => {
    if (!nextVideo?.id) return;
    stopFadeTimers();
    const player = deckPlayerRefs[key].current;
    if (!player) {
      dispatch(setYoutubeVideo(nextVideo));
      return;
    }

    const oldVideoId = videoRef.current?.id;
    if (recordCompletion && status === "authenticated" && oldVideoId) {
      recordPlayEvent(oldVideoId, "completed");
    }
    videoRef.current = nextVideo;
    skipCrossfadeVideoRef.current = null;
    activeDeckRef.current = key;
    setActiveDeck(key);
    destroyDeck(otherDeck(key));
    preloadedIdRef.current = null;
    preloadingRef.current = null;
    preloadRetryAtRef.current = 0;
    resetActiveRecovery(nextVideo.id);
    handledVideoIdRef.current = nextVideo.id;
    setCurrentTime(0);
    setDuration(0);
    setDeliveredVideoQuality("");
    markExpectPlaying();
    player.unMute?.();
    applyPlaybackVolume(player);
    requestYouTubeQuality(player, requestedYouTubeQuality);
    player.loadVideoById?.({ videoId: nextVideo.id, startSeconds: 0 });
    resumePlayer(player);
    dispatch(playPause(true));
    dispatch(setYoutubeVideo(nextVideo));
  };

  const mountDeck = (
    key,
    videoId,
    { onFirstPlaying, onDeckReady, autoplay = true, title } = {},
  ) => {
    const host = deckHostRefs[key].current;
    if (!host) return null;
    destroyDeck(key);
    const generation = deckGenerationRef.current[key];
    const isCurrent = () => deckGenerationRef.current[key] === generation;

    const playerParams = new URLSearchParams({
      autoplay: autoplay ? "1" : "0",
      cc_load_policy: captionsEnabled ? "1" : "0",
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
      vq: key !== activeDeckRef.current ? "small" : requestedYouTubeQuality,
      widget_referrer: window.location.href,
    });
    // Let the official IFrame API create and navigate the iframe. Passing an
    // already-navigating iframe can make the API postMessage to YouTube while
    // the frame still has the app origin, which breaks playback in some
    // browsers with a target-origin mismatch.
    const mount = document.createElement("div");
    mount.id = `youtube-deck-${key}-${generation}`;
    host.replaceChildren(mount);

    let hasUnmutedOnce = false;
    let firstPlayingHandled = false;
    const player = new window.YT.Player(mount.id, {
      host: "https://www.youtube.com",
      videoId,
      width: "100%",
      height: "100%",
      playerVars: Object.fromEntries(playerParams),
      events: {
        onReady: (event) => {
          if (!isCurrent()) return;
          const frame = event.target.getIframe();
          frame.style.width = "100%";
          frame.style.height = "100%";
          frame.style.pointerEvents = "none";
          frame.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
          const frameAllow = frame.getAttribute("allow") || "";
          if (!frameAllow.includes("compute-pressure")) {
            frame.setAttribute(
              "allow",
              `${frameAllow}${frameAllow.trim() ? "; " : ""}compute-pressure`,
            );
          }
          if (key === activeDeckRef.current) {
            setDuration(safeMediaTime(event.target.getDuration()));
            requestYouTubeQuality(event.target, requestedYouTubeQuality);
            reportPlaybackQuality(event.target, key);
          } else {
            event.target.setPlaybackQuality?.("small");
          }
          event.target.mute();
          applyYouTubeCaptions(event.target, captionsEnabled && !karaokeHasLinesRef.current);
          onDeckReady?.(event.target);
          if (autoplay) event.target.playVideo();
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
            if (key === activeDeckRef.current) {
              setPlayerError(null);
              requestYouTubeQuality(event.target, requestedYouTubeQuality);
              reportPlaybackQuality(event.target, key);
              const playingId = playerVideoId(event.target);
              if (
                activeTrackStartedRef.current.videoId !== playingId ||
                !activeTrackStartedRef.current.startedAt
              ) {
                activeTrackStartedRef.current = {
                  videoId: playingId,
                  startedAt: performance.now(),
                };
              }
              markActivePlaybackHealthy(key, event.target, generation);
            }
            if (!firstPlayingHandled) {
              firstPlayingHandled = true;
              onFirstPlaying?.(event.target);
            }
            const waiting = handoffWaitingRef.current;
            if (
              waiting?.incomingKey === key &&
              waiting?.nextVideo?.id === playerVideoId(event.target) &&
              isVerifiedIncoming(key, event.target, waiting.nextVideo.id)
            ) {
              completeCrossfade(
                waiting.outgoingKey,
                waiting.incomingKey,
                waiting.nextVideo,
              );
              return;
            }
          }
          if (key !== activeDeckRef.current) return;
          const stateCode = ({ 0: "ended", 1: "playing", 2: "paused", 3: "buffering" })[event.data];
          if (stateCode) recordDiagnostic("playback_state", { code: stateCode });
          if (event.data === window.YT.PlayerState.PLAYING) {
            if (sleep.check() || (userPausedRef.current && !isPlayingRef.current)) {
              event.target.pauseVideo?.();
              return;
            }
            userPausedRef.current = false;
            dispatch(playPause(true));
          }
          if (
            event.data === window.YT.PlayerState.CUED ||
            event.data === window.YT.PlayerState.UNSTARTED
          ) {
            if (wantsPlayback()) resumePlayer(event.target);
          }
          if (event.data === window.YT.PlayerState.BUFFERING) {
            scheduleActiveBufferRecovery(key, event.target, generation);
          }
          if (
            event.data === window.YT.PlayerState.PAUSED &&
            !crossfadeInProgressRef.current &&
            !expandLockRef.current &&
            !isSeekGuarded()
          ) {
            if (isPageHidden()) {
              markBackgroundPlayback();
              // Keep foreground-resume intent, but report the actual paused
              // engine state to the UI and notification controls.
              if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
              dispatch(playPause(false));
              return;
            }
            clearActiveBufferTimers();
            if (userPausedRef.current) {
              dispatch(playPause(false));
              return;
            }
            if (wantsPlayback()) {
              resumePlayer(event.target);
              dispatch(playPause(true));
              return;
            }
          }
          if (event.data === window.YT.PlayerState.ENDED) {
            clearActiveBufferTimers();
            if (isRealTrackEnd(event.target)) insights.finish("completed");
            if (isRealTrackEnd(event.target) && sleep.check(videoRef.current?.id)) return;
            if (!isRealTrackEnd(event.target)) {
              const target = seekGuardRef.current.target ?? event.target.getCurrentTime?.() ?? 0;
              const want = videoRef.current?.id;
              if (want && playerVideoId(event.target) && playerVideoId(event.target) !== want) {
                event.target.loadVideoById?.({ videoId: want, startSeconds: Math.max(0, target || 0) });
              } else {
                event.target.seekTo?.(Math.max(0, target), true);
              }
              if (isPlayingRef.current) {
                event.target.unMute?.();
                applyPlaybackVolume(event.target);
                event.target.playVideo?.();
              }
              return;
            }
            if (isJamGuestRef.current) {
              dispatch(playPause(false));
              return;
            }

            const endedToken = `${key}:${generation}:${videoRef.current?.id || ""}`;
            if (endedTransitionRef.current === endedToken) return;
            endedTransitionRef.current = endedToken;
            const nextVideo = pendingNextRef.current || getNextVideo();
            const incomingKey = otherDeck(key);
            const incoming = deckPlayerRefs[incomingKey].current;
            const incomingMatches =
              incoming &&
              nextVideo &&
              playerVideoId(incoming) === nextVideo.id;
            if (
              crossfadeInProgressRef.current &&
              incomingMatches &&
              isVerifiedIncoming(incomingKey, incoming, nextVideo.id)
            ) {
              completeCrossfade(key, incomingKey, nextVideo);
              return;
            }
            if (crossfadeInProgressRef.current && incomingMatches) {
              handoffWaitingRef.current = {
                outgoingKey: key,
                incomingKey,
                nextVideo,
              };
              applyPlaybackVolume(incoming);
              incoming.unMute?.();
              incoming.playVideo?.();
              if (handoffTimerRef.current) {
                window.clearTimeout(handoffTimerRef.current);
              }
              const handoffStartedAt = performance.now();
              const retryHandoff = () => {
                if (
                  handoffWaitingRef.current?.incomingKey !== incomingKey ||
                  !crossfadeInProgressRef.current
                ) {
                  return;
                }
                const candidate = deckPlayerRefs[incomingKey].current;
                if (isVerifiedIncoming(incomingKey, candidate, nextVideo.id)) {
                  completeCrossfade(key, incomingKey, nextVideo);
                  return;
                }
                candidate?.unMute?.();
                applyPlaybackVolume(candidate);
                candidate?.playVideo?.();
                if (performance.now() - handoffStartedAt >= 10000) {
                  hardSwitchOnDeck(key, nextVideo);
                  return;
                }
                handoffTimerRef.current = window.setTimeout(
                  retryHandoff,
                  200,
                );
              };
              handoffTimerRef.current = window.setTimeout(retryHandoff, 200);
              return;
            }
            if (crossfadeInProgressRef.current && nextVideo) {
              hardSwitchOnDeck(key, nextVideo);
              return;
            }
            if (!crossfadeInProgressRef.current && nextVideo) {
              hardSwitchOnDeck(key, nextVideo);
              return;
            }
            if (!nextVideo) {
              void playNextOrContinueRef.current?.(true);
            }
          }
        },
        onPlaybackQualityChange: (event) => {
          if (!isCurrent() || key !== activeDeckRef.current) return;
          const quality = event.data || event.target.getPlaybackQuality?.();
          if (quality) {
            setDeliveredVideoQuality((current) => (current === quality ? current : quality));
          }
        },
        onAutoplayBlocked: () => {
          if (!isCurrent()) return;
          if (isPageHidden() && !userPausedRef.current) {
            markBackgroundPlayback();
            return;
          }
          if (key === activeDeckRef.current) {
            clearActiveBufferTimers();
            userPausedRef.current = true;
            trackChangeUntilRef.current = 0;
            setPlayerError({
              kind: "autoplay",
              message: "Your browser blocked autoplay. Select Retry to start playback.",
            });
            dispatch(playPause(false));
          } else {
            recoverFromIncomingFailure(key);
          }
        },
        onError: (event) => {
          if (!isCurrent()) return;
          if (key === activeDeckRef.current) {
            clearActiveBufferTimers();
            userPausedRef.current = true;
            trackChangeUntilRef.current = 0;
            setPlayerError({
              kind: "playback",
              ...youtubePlaybackError(event.data),
            });
            dispatch(playPause(false));
          } else {
            recoverFromIncomingFailure(key);
          }
        },
      },
    });
    deckPlayerRefs[key].current = player;
    return player;
  };

  const completeCrossfade = (outgoingKey, incomingKey, nextVideo) => {
    if (
      !crossfadeInProgressRef.current ||
      pendingNextRef.current?.id !== nextVideo?.id ||
      activeDeckRef.current !== outgoingKey
    ) {
      return false;
    }
    const incomingPlayer = deckPlayerRefs[incomingKey].current;
    if (!isVerifiedIncoming(incomingKey, incomingPlayer, nextVideo.id)) {
      return false;
    }

    if (status === "authenticated" && videoRef.current?.id) {
      recordPlayEvent(videoRef.current.id, "completed");
    }
    stopFadeTimers();
    videoRef.current = nextVideo;
    skipCrossfadeVideoRef.current = null;
    activeDeckRef.current = incomingKey;
    setActiveDeck(incomingKey);
    activeTrackStartedRef.current = {
      videoId: nextVideo.id,
      startedAt: performance.now(),
    };
    resetActiveRecovery(nextVideo.id);
    activeRecoveryRef.current.lastTime = incomingPlayer.getCurrentTime?.() || 0;
    activeRecoveryRef.current.lastAdvancedAt = performance.now();
    requestYouTubeQuality(incomingPlayer, requestedYouTubeQuality);
    applyPlaybackVolume(incomingPlayer);
    incomingPlayer?.unMute?.();
    incomingPlayer?.playVideo?.();
    const outgoingPlayer = deckPlayerRefs[outgoingKey].current;
    outgoingPlayer?.mute?.();
    outgoingPlayer?.setVolume?.(0);
    outgoingPlayer?.pauseVideo?.();
    handledVideoIdRef.current = nextVideo.id;
    preloadedIdRef.current = null;
    preloadingRef.current = null;
    preloadRetryAtRef.current = 0;
    setCurrentTime(0);
    setDuration(safeMediaTime(incomingPlayer?.getDuration?.()));
    dispatch(playPause(true));
    dispatch(setYoutubeVideo(nextVideo));
    return true;
  };

  const runCrossfadeRamp = (outgoingKey, incomingKey, nextVideo, durationSeconds) => {
    const totalMs = Math.max(350, Math.min(durationSeconds * 1000, 10000));
    let elapsedMs = 0;
    let lastFrameAt = performance.now();
    let bufferingSince = null;
    const outgoingGeneration = deckGenerationRef.current[outgoingKey];
    const incomingGeneration = deckGenerationRef.current[incomingKey];

    const step = (now) => {
      if (!crossfadeInProgressRef.current) return;
      if (
        deckGenerationRef.current[outgoingKey] !== outgoingGeneration ||
        deckGenerationRef.current[incomingKey] !== incomingGeneration
      ) {
        stopFadeTimers();
        return;
      }
      const outgoingPlayer = deckPlayerRefs[outgoingKey].current;
      const incomingPlayer = deckPlayerRefs[incomingKey].current;
      const incomingState = incomingPlayer?.getPlayerState?.();
      const incomingMatches = playerVideoId(incomingPlayer) === nextVideo.id;
      const incomingProgress = incomingMatches
        ? noteIncomingProgress(incomingKey, incomingPlayer)
        : null;
      const incomingReady =
        incomingState === window.YT?.PlayerState?.PLAYING &&
        incomingProgress?.lastAdvancedAt > 0 &&
        now - incomingProgress.lastAdvancedAt <= INCOMING_STALL_MS;

      if (!incomingMatches) {
        incomingPlayer?.mute?.();
        stopFadeTimers();
        preloadedIdRef.current = null;
        preloadingRef.current = null;
        preloadRetryAtRef.current = performance.now() + 2000;
        outgoingPlayer?.unMute?.();
        applyPlaybackVolume(outgoingPlayer);
        if (isPlayingRef.current) outgoingPlayer?.playVideo?.();
        return;
      }

      // Never fade the audible deck while the incoming deck is buffering or frozen.
      if (!incomingReady) {
        bufferingSince ??= now;
        lastFrameAt = now;
        applyPlaybackVolume(outgoingPlayer);
        applyPlaybackVolume(incomingPlayer, 0);
        if (now - bufferingSince > 3000) {
          incomingPlayer?.mute?.();
          incomingPlayer?.pauseVideo?.();
          incomingPlayer?.seekTo?.(0, true);
          stopFadeTimers();
          preloadedIdRef.current = null;
          preloadingRef.current = null;
          preloadRetryAtRef.current = performance.now() + 2000;
          outgoingPlayer?.unMute?.();
          applyPlaybackVolume(outgoingPlayer);
          if (isPlayingRef.current) outgoingPlayer?.playVideo?.();
          return;
        }
        crossfadeTimerRef.current = window.requestAnimationFrame(step);
        return;
      }

      bufferingSince = null;
      elapsedMs += now - lastFrameAt;
      lastFrameAt = now;
      const progress = Math.min(1, elapsedMs / totalMs);
      applyPlaybackVolume(outgoingPlayer, Math.cos((progress * Math.PI) / 2));
      applyPlaybackVolume(incomingPlayer, Math.sin((progress * Math.PI) / 2));
      if (progress === 0 || progress === 1 || Math.round(progress * 20) !== Math.round((progress - 0.016) * 20)) {
        setFadeProgress(progress);
      }

      if (progress >= 1) {
        if (!completeCrossfade(outgoingKey, incomingKey, nextVideo)) {
          stopFadeTimers();
          outgoingPlayer?.unMute?.();
          applyPlaybackVolume(outgoingPlayer);
          if (isPlayingRef.current) outgoingPlayer?.playVideo?.();
        }
        return;
      }
      crossfadeTimerRef.current = window.requestAnimationFrame(step);
    };
    crossfadeTimerRef.current = window.requestAnimationFrame(step);
  };

  const startCrossfade = (nextVideo, durationSeconds) => {
    if (crossfadeInProgressRef.current || !nextVideo?.id) return;
    const outgoingKey = activeDeckRef.current;
    const incomingKey = otherDeck(outgoingKey);
    const existing = deckPlayerRefs[incomingKey].current;
    if (
      !isPreloadedFor(nextVideo.id, incomingKey) ||
      (existing && playerVideoId(existing) !== nextVideo.id)
    ) {
      preloadedIdRef.current = null;
      return;
    }

    clearPreloadTimers();
    crossfadeInProgressRef.current = true;
    pendingNextRef.current = nextVideo;
    let expectedIncomingGeneration = deckGenerationRef.current[incomingKey];
    let rampStarted = false;

    const isExpectedIncoming = (player) =>
      deckPlayerRefs[incomingKey].current === player &&
      deckGenerationRef.current[incomingKey] === expectedIncomingGeneration &&
      playerVideoId(player) === nextVideo.id;

    const isFreshIncomingPlaying = (player) =>
      isExpectedIncoming(player) &&
      isVerifiedIncoming(incomingKey, player, nextVideo.id, {
        minAdvance: 0.12,
        maxStallMs: 800,
      }) &&
      (player?.getCurrentTime?.() || 0) < 4;

    const restoreOutgoing = () => {
      const outgoing = deckPlayerRefs[outgoingKey].current;
      const incoming = deckPlayerRefs[incomingKey].current;
      incoming?.mute?.();
      incoming?.setVolume?.(0);
      incoming?.pauseVideo?.();
      incoming?.seekTo?.(0, true);
      stopFadeTimers();
      preloadedIdRef.current = null;
      preloadingRef.current = null;
      preloadRetryAtRef.current = performance.now() + 2000;
      outgoing?.unMute?.();
      applyPlaybackVolume(outgoing);
      if (isPlayingRef.current) outgoing?.playVideo?.();
    };

    failSafeRef.current = window.setTimeout(() => {
      if (!crossfadeInProgressRef.current || rampStarted) return;
      const incoming = deckPlayerRefs[incomingKey].current;
      if (isFreshIncomingPlaying(incoming)) {
        beginRamp(incoming);
        return;
      }
      restoreOutgoing();
    }, 4000);

    const beginRamp = (incomingPlayer) => {
      if (
        rampStarted ||
        !crossfadeInProgressRef.current ||
        pendingNextRef.current?.id !== nextVideo.id ||
        !isFreshIncomingPlaying(incomingPlayer)
      ) {
        return;
      }
      rampStarted = true;
      if (failSafeRef.current) {
        window.clearTimeout(failSafeRef.current);
        failSafeRef.current = null;
      }
      if (waitForPlayRef.current) {
        window.clearInterval(waitForPlayRef.current);
        waitForPlayRef.current = null;
      }
      incomingPlayer.mute?.();
      incomingPlayer.setVolume?.(0);
      incomingPlayer.unMute();
      applyPlaybackVolume(incomingPlayer, 0);
      incomingPlayer.playVideo?.();
      const outgoingPlayer = deckPlayerRefs[outgoingKey].current;
      const remaining =
        (outgoingPlayer?.getDuration?.() || 0) -
        (outgoingPlayer?.getCurrentTime?.() || 0);
      const rampSeconds =
        remaining > 0
          ? Math.min(durationSeconds, Math.max(0.35, remaining - 0.15))
          : durationSeconds;
      runCrossfadeRamp(outgoingKey, incomingKey, nextVideo, rampSeconds);
    };

    const waitUntilPlaying = (player) => {
      if (isFreshIncomingPlaying(player)) {
        beginRamp(player);
        return;
      }
      waitForPlayRef.current = window.setInterval(() => {
        if (!crossfadeInProgressRef.current || rampStarted) {
          window.clearInterval(waitForPlayRef.current);
          waitForPlayRef.current = null;
          return;
        }
        if (
          deckPlayerRefs[incomingKey].current !== player ||
          deckGenerationRef.current[incomingKey] !== expectedIncomingGeneration
        ) {
          window.clearInterval(waitForPlayRef.current);
          waitForPlayRef.current = null;
          restoreOutgoing();
          return;
        }
        if (isFreshIncomingPlaying(player)) {
          window.clearInterval(waitForPlayRef.current);
          waitForPlayRef.current = null;
          beginRamp(player);
        }
      }, 80);
    };

    // A cue-only deck has no stale media pipeline, so starting it here avoids
    // both iframe startup latency and background-stream contention.
    if (existing) {
      existing.mute?.();
      existing.setVolume?.(0);
      existing.loadVideoById?.({ videoId: nextVideo.id, startSeconds: 0 });
      existing.playVideo?.();
      waitUntilPlaying(existing);
      return;
    }

    const mounted = mountDeck(incomingKey, nextVideo.id, {
      onFirstPlaying: waitUntilPlaying,
      title: nextVideo.title,
    });
    expectedIncomingGeneration = deckGenerationRef.current[incomingKey];
    if (mounted) waitUntilPlaying(mounted);
    else restoreOutgoing();
  };

  const preloadNext = (nextVideo) => {
    if (!nextVideo?.id || !apiReady || transitionMode === "off" || dataSaver) return;
    if (nextVideo.thumbnail && typeof window !== "undefined") {
      try {
        const image = new Image();
        image.src = youtubeThumb(nextVideo.thumbnail, "hq");
      } catch {
        // Image preload is best-effort.
      }
    }
    if (crossfadeInProgressRef.current) return;
    if (performance.now() < preloadRetryAtRef.current) return;
    if (!isActivePlaybackHealthy()) {
      preloadRetryAtRef.current = performance.now() + 1000;
      return;
    }
    const idleKey = otherDeck(activeDeckRef.current);
    const idle = deckPlayerRefs[idleKey].current;
    if (isPreloadedFor(nextVideo.id, idleKey)) return;
    if (preloadingRef.current === nextVideo.id && idle) return;
    clearPreloadTimers();
    preloadingRef.current = nextVideo.id;
    let expectedGeneration = deckGenerationRef.current[idleKey];

    const isCurrentIdlePreload = (player) =>
      !crossfadeInProgressRef.current &&
      activeDeckRef.current !== idleKey &&
      deckPlayerRefs[idleKey].current === player &&
      deckGenerationRef.current[idleKey] === expectedGeneration &&
      preloadingRef.current === nextVideo.id;

    const cueIdleDeck = (player) => {
      if (!isCurrentIdlePreload(player)) return;
      clearPreloadTimers();
      player.mute?.();
      player.setVolume?.(0);
      player.pauseVideo?.();
      player.setPlaybackQuality?.("tiny");
      player.cueVideoById?.({ videoId: nextVideo.id, startSeconds: 0 });
      const cueStartedAt = performance.now();

      preloadPollTimerRef.current = window.setInterval(() => {
        if (!isCurrentIdlePreload(player)) {
          clearPreloadTimers();
          return;
        }
        const state = player.getPlayerState?.();
        const cueReady =
          playerVideoId(player) === nextVideo.id &&
          (
            state === window.YT?.PlayerState?.CUED ||
            (state === window.YT?.PlayerState?.PAUSED && (player.getDuration?.() || 0) > 0)
          );
        if (cueReady) {
          clearPreloadTimers();
          markPreloaded(nextVideo.id, idleKey);
          preloadingRef.current = null;
          preloadRetryAtRef.current = 0;
          return;
        }
        if (performance.now() - cueStartedAt >= 6000) {
          clearPreloadTimers();
          player.mute?.();
          player.setVolume?.(0);
          player.pauseVideo?.();
          preloadedIdRef.current = null;
          preloadingRef.current = null;
          preloadRetryAtRef.current = performance.now() + 3000;
        }
      }, 100);
    };

    if (idle?.cueVideoById) {
      cueIdleDeck(idle);
      return;
    }

    const mounted = mountDeck(idleKey, nextVideo.id, {
      autoplay: false,
      onDeckReady: cueIdleDeck,
      title: nextVideo.title,
    });
    expectedGeneration = deckGenerationRef.current[idleKey];
    if (!mounted) {
      preloadingRef.current = null;
      preloadRetryAtRef.current = performance.now() + 3000;
    }
  };
  preloadNextRef.current = preloadNext;

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
    if (!video?.id) {
      cancelCrossfade();
      clearActiveBufferTimers();
      destroyDeck("A");
      destroyDeck("B");
      return;
    }
    if (!apiReady) return;
    if (restorePosition !== null && restorePosition !== undefined) {
      cancelCrossfade();
      clearActiveBufferTimers();
      destroyDeck("A");
      destroyDeck("B");
      activeDeckRef.current = "A";
      setActiveDeck("A");
      userPausedRef.current = true;
      setCurrentTime(restorePosition);
      setDuration(0);
      setPlayerError(null);
      mountDeck("A", video.id, {
        title: video.title,
        autoplay: false,
        onDeckReady: (player) => {
          player.cueVideoById?.({ videoId: video.id, startSeconds: restorePosition });
          if (isPlayingRef.current) resumePlayer(player);
        },
      });
      return;
    }
    markExpectPlaying();
    endedTransitionRef.current = null;
    preloadRetryAtRef.current = 0;
    resetActiveRecovery(video.id);
    if (skipCrossfadeVideoRef.current !== video.id) {
      skipCrossfadeVideoRef.current = null;
    }
    if (activeTrackStartedRef.current.videoId !== video.id) {
      activeTrackStartedRef.current = { videoId: video.id, startedAt: 0 };
    }

    // The crossfade engine already loaded and is playing this exact track; just adopt it.
    if (handledVideoIdRef.current === video.id) {
      handledVideoIdRef.current = null;
      return;
    }

    const idleKey = otherDeck(activeDeckRef.current);
    const idle = deckPlayerRefs[idleKey].current;
    const idleId = playerVideoId(idle);
    if (idle && idleId === video.id) {
      if (!isPreloadedFor(video.id, idleKey)) {
        hardSwitchOnDeck(activeDeckRef.current, video, {
          recordCompletion: false,
        });
        return;
      }
      stopFadeTimers();
      const outgoingKey = activeDeckRef.current;
      const idleGeneration = deckGenerationRef.current[idleKey];
      const outgoing = deckPlayerRefs[outgoingKey].current;
      let cancelled = false;
      let promoted = false;
      let poll = null;
      let fallback = null;
      preloadedIdRef.current = null;
      preloadingRef.current = null;
      outgoing?.unMute?.();
      applyPlaybackVolume(outgoing);
      if (isPlayingRef.current) outgoing?.playVideo?.();

      try {
        idle.mute?.();
        idle.setVolume?.(0);
        const t = idle.getCurrentTime?.() || 0;
        if (t > 0.15) idle.seekTo?.(0, true);
        idle.playVideo?.();
      } catch (error) {
        // Preloaded deck may still be buffering.
      }

      const promoteWhenPlaying = () => {
        if (
          cancelled ||
          promoted ||
          deckPlayerRefs[idleKey].current !== idle ||
          deckGenerationRef.current[idleKey] !== idleGeneration ||
          !isVerifiedIncoming(idleKey, idle, video.id)
        ) {
          return false;
        }
        promoted = true;
        if (fallback) {
          window.clearTimeout(fallback);
          fallback = null;
        }
        activeDeckRef.current = idleKey;
        setActiveDeck(idleKey);
        activeTrackStartedRef.current = {
          videoId: video.id,
          startedAt: performance.now(),
        };
        resetActiveRecovery(video.id);
        activeRecoveryRef.current.lastTime = idle.getCurrentTime?.() || 0;
        activeRecoveryRef.current.lastAdvancedAt = performance.now();
        requestYouTubeQuality(idle, requestedYouTubeQuality);
        applyPlaybackVolume(idle);
        idle.unMute?.();
        idle.playVideo?.();
        destroyDeck(outgoingKey);
        setPlayerError(null);
        setCurrentTime(safeMediaTime(idle.getCurrentTime?.()));
        setDuration(safeMediaTime(idle.getDuration?.()));
        dispatch(playPause(true));
        return true;
      };

      if (!promoteWhenPlaying()) {
        poll = window.setInterval(() => {
          if (promoteWhenPlaying() && poll) {
            window.clearInterval(poll);
            poll = null;
          }
        }, 60);
        fallback = window.setTimeout(() => {
          if (!promoted && !cancelled) {
            if (poll) window.clearInterval(poll);
            poll = null;
            hardSwitchOnDeck(outgoingKey, video, {
              recordCompletion: false,
            });
          }
        }, 15000);
      }

      return () => {
        cancelled = true;
        if (poll) window.clearInterval(poll);
        if (fallback) window.clearTimeout(fallback);
      };
    }

    stopFadeTimers();
    preloadedIdRef.current = null;
    preloadingRef.current = null;
    seekGuardRef.current = { seeking: false, until: 0, target: null, videoId: null };
    nearEndStreakRef.current = 0;
    setPlayerError(null);
    setCurrentTime(0);
    setDuration(0);
    setDeliveredVideoQuality("");
    dispatch(playPause(true));
    const existing = getActivePlayer();
    if (existing?.loadVideoById) {
      existing.unMute?.();
      applyPlaybackVolume(existing);
      existing.loadVideoById({ videoId: video.id, startSeconds: 0 });
      existing.playVideo?.();
      const nextId = getNextVideo()?.id;
      if (idle && idleId && idleId !== nextId) destroyDeck(idleKey);
      return;
    }
    destroyDeck("A");
    destroyDeck("B");
    activeDeckRef.current = "A";
    setActiveDeck("A");
    mountDeck("A", video.id, { title: video.title });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video?.id, apiReady, playbackOwner]);

  useEffect(() => () => {
    cancelFade();
    cancelCrossfade();
    clearActiveBufferTimers();
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
      const activePlayer = getActivePlayer();
      if (!activePlayer?.getCurrentTime) return;
      const time = activePlayer.getCurrentTime();
      const dur = activePlayer.getDuration();
      const guard = seekGuardRef.current;
      const id = playerVideoId(activePlayer);
      const want = videoRef.current?.id;
      if (id === want && Number.isFinite(time) && time >= 0
        && (id !== savedProgressRef.current.id || Math.abs(time - savedProgressRef.current.position) >= 5)
        && activePlayer.getPlayerState?.() !== window.YT?.PlayerState?.CUED) {
        savedProgressRef.current = { id, position: time };
        dispatch(setPlaybackPosition({ id, position: time }));
      }
      const pendingJamPlayback = pendingJamPlaybackRef.current;
      if (
        pendingJamPlayback?.videoId === want
        && id === want
      ) {
        pendingJamPlaybackRef.current = null;
        userPausedRef.current = !pendingJamPlayback.isPlaying;
        if (pendingJamPlayback.isPlaying) {
          resumePlayer(activePlayer);
        } else {
          cancelFade();
          activePlayer.pauseVideo?.();
        }
      }

      const pendingJamSeek = pendingJamSeekRef.current;
      if (
        pendingJamSeek?.videoId === want
        && (!id || id === want)
        && safeMediaTime(dur) > 0
      ) {
        const target = Math.min(
          safeMediaTime(pendingJamSeek.currentTime),
          Math.max(0, safeMediaTime(dur) - 0.25),
        );
        pendingJamSeekRef.current = null;
        if (Math.abs(safeMediaTime(time) - target) > 2.5) {
          try {
            activePlayer.seekTo?.(target, true);
            markSeek(target);
          } catch {
            pendingJamSeekRef.current = pendingJamSeek;
          }
        }
      }

      if (
        want
        && (!id || id === want)
        && performance.now() - lastJamPlaybackReportRef.current >= 900
      ) {
        lastJamPlaybackReportRef.current = performance.now();
        window.dispatchEvent(new CustomEvent(JAM_PLAYBACK_STATE_EVENT, {
          detail: {
            videoId: want,
            currentTime: safeMediaTime(time),
            duration: safeMediaTime(dur),
            isPlaying: isPlayingRef.current,
          },
        }));
      }
      watchActiveProgress(
        activeDeckRef.current,
        activePlayer,
        deckGenerationRef.current[activeDeckRef.current],
      );
      if (
        activePlayer.getPlayerState?.() === window.YT?.PlayerState?.BUFFERING
      ) {
        scheduleActiveBufferRecovery(
          activeDeckRef.current,
          activePlayer,
          deckGenerationRef.current[activeDeckRef.current],
        );
      }
      if (want && id && id !== want && !crossfadeInProgressRef.current && !isSeekGuarded()) {
        activePlayer.loadVideoById?.({ videoId: want, startSeconds: Math.max(0, guard.target || 0) });
        activePlayer.playVideo?.();
        markSeek(guard.target || 0);
        return;
      }
      const seekPending = guard.target != null && (guard.seeking || Math.abs(time - guard.target) > 1.25);
      if (seekPending && !guard.seeking && guard.target != null) {
        try {
          activePlayer.seekTo(guard.target, true);
        } catch (error) {
          // Player is still buffering the seek.
        }
      }
      setCurrentTime(safeMediaTime(seekPending ? guard.target : time));
      if (safeMediaTime(dur) > 0) setDuration(safeMediaTime(dur));
      if (!guard.seeking && guard.target != null && Math.abs(time - guard.target) <= 1.25 && (!want || !id || id === want)) {
        guard.target = null;
      }

      if (isJamGuestRef.current) {
        nearEndStreakRef.current = 0;
        return;
      }

      const nextVideo = getNextVideo();
      if (!crossfadeInProgressRef.current && nextVideo && !isPreloadedFor(nextVideo.id)) {
        preloadNextRef.current(nextVideo);
      }
      if (isSeekGuarded() || !isPlaying || crossfadeInProgressRef.current || !dur) {
        nearEndStreakRef.current = 0;
        return;
      }
      const remaining = dur - time;
      // Fade the last seconds of the track down so it blends into the next one.
      const fadeWindow = Math.min(Number(fadeSeconds) || 0, dur / 3);
      if (
        fadeEnabled !== false
        && dur > 8
        && fadeWindow >= 0.5
        && want
        && endFadeVideoRef.current !== want
        && remaining <= fadeWindow
        && remaining > 0.4
      ) {
        endFadeVideoRef.current = want;
        rampVolume(activePlayer, 1, 0, { durationMs: remaining * 1000 });
      }

      const requestedFadeSeconds = 0;
      // YouTube's first iframe media segment is typically about five seconds.
      // Releasing the outgoing stream sooner leaves headroom for segment two.
      const crossfadeWindow = Math.min(
        requestedFadeSeconds,
        MAX_SAFE_YOUTUBE_CROSSFADE_SECONDS,
      );
      if (crossfadeWindow <= 0) {
        nearEndStreakRef.current = 0;
        return;
      }
      const transitionLeadSeconds = Math.min(
        requestedFadeSeconds,
        crossfadeWindow + 3,
      );
      if (remaining <= transitionLeadSeconds && remaining > 0.25) nearEndStreakRef.current += 1;
      else nearEndStreakRef.current = 0;
      if (!nextVideo) return;
      const ready = isPreloadedFor(nextVideo.id);
      if (ready && nearEndStreakRef.current >= 1) {
        startCrossfade(nextVideo, Math.min(crossfadeWindow, Math.max(remaining - 0.2, 0.8)));
      }
    };
  });

  const remainingAfterCurrent = () => {
    const currentId = videoRef.current?.id;
    const list = Array.isArray(queueRef.current) ? queueRef.current : [];
    const index = list.findIndex((item) => item?.id === currentId);
    if (index < 0) return 0;
    return Math.max(0, list.length - index - 1);
  };

  const extendQueue = async () => {
    if (oneMoreArmedRef.current || manualEndRef.current || autoExtendingRef.current || repeatRef.current) return [];
    if (lastExtendEmptyRef.current && Date.now() - lastExtendAtRef.current < 15000) return [];
    autoExtendingRef.current = true;
    lastExtendAtRef.current = Date.now();
    try {
      const current = videoRef.current;
      const list = Array.isArray(queueRef.current) ? queueRef.current : [];
      const existingIds = new Set(list.map((item) => item.id));
      const titleSeed = String(current?.title || "")
        .replace(/\s*[\(\[][^)\]]*[\)\]]/g, "")
        .replace(/\s*(official|audio|video|lyrics|hd|4k)\s*/gi, " ")
        .trim();
      const seeds = [...new Set([
        current?.seedQuery,
        current?.genre,
        current?.channel ? `${current.channel} songs` : "",
        current?.channel ? `${current.channel} mix` : "",
        titleSeed ? `${titleSeed} radio` : "",
        "popular music mix",
      ].filter(Boolean))].slice(0, 3);

      const searches = await Promise.all(
        seeds.map((seed) =>
          requestJson(`/api/youtube-search?type=video&q=${encodeURIComponent(seed)}`, {
            fallbackTitle: "Queue search is temporarily unavailable",
            fallbackMessage: "We couldn’t find more tracks right now.",
          }).catch(() => null),
        ),
      );

      const extras = [];
      const remember = (item) => {
        if (!item?.id || existingIds.has(item.id)) return;
        existingIds.add(item.id);
        extras.push({
          ...item,
          seedQuery: current?.seedQuery || current?.genre || current?.channel || item.channel,
          genre: current?.genre || item.genre,
        });
      };

      for (const data of searches) {
        for (const item of Array.isArray(data?.results) ? data.results : []) remember(item);
      }

      if (extras.length < 6) {
        try {
          const rec = await requestJson("/api/recommendations", {
            fallbackTitle: "Queue search is temporarily unavailable",
            fallbackMessage: "We couldn’t find more tracks right now.",
          });
          const sections = rec?.sections || {};
          const recVideos = [
            ...(sections.trending || []),
            ...(sections.charts || []),
            ...(sections.newReleases || []),
            ...((sections.genres || []).flatMap((group) => group.videos || [])),
          ];
          recVideos.forEach(remember);
        } catch {
          // Radio fallback below still keeps playback going.
        }
      }

      const nextTracks = extras.slice(0, 16);
      if (manualEndRef.current || current?.id !== videoRef.current?.id) return [];
      if (nextTracks.length > 0) {
        dispatch(appendToQueue(nextTracks));
        lastExtendEmptyRef.current = false;
      } else {
        lastExtendEmptyRef.current = true;
      }
      return nextTracks;
    } catch {
      lastExtendEmptyRef.current = true;
      return [];
    } finally {
      autoExtendingRef.current = false;
    }
  };
  extendQueueRef.current = extendQueue;

  const replayCurrent = () => {
    markExpectPlaying();
    seekOnCurrentTrack(0);
    resumePlayer(getActivePlayer());
    dispatch(playPause(true));
  };

  const playNextOrContinue = async (completed = false) => {
    if (sleep.check(completed ? videoRef.current?.id : undefined)) return;
    if (isJamGuestRef.current) {
      dispatch(playPause(false));
      return;
    }
    const current = videoRef.current;
    if (status === "authenticated" && current?.id) {
      recordPlayEvent(current.id, completed ? "completed" : "skipped");
    }
    if (shouldOfferOneMore({
      armed: oneMoreArmedRef.current,
      completed,
      radio: !manualEndRef.current,
      jamGuest: false,
    })) {
      oneMoreArmedRef.current = false;
      setOneMoreArmed(false);
      userPausedRef.current = true;
      trackChangeUntilRef.current = 0;
      getActivePlayer()?.pauseVideo?.();
      dispatch(playPause(false));
      const suggestion = oneMorePrefetchRef.current || {
        title: "Radio paused after this track",
        channel: "We couldn’t find a last related song.",
      };
      oneMoreSuggestionRef.current = suggestion;
      setOneMoreSuggestion(suggestion);
      return;
    }
    markExpectPlaying();
    dispatch(playPause(true));
    const immediate = getNextVideo();
    if (immediate) {
      if (immediate.id === current?.id) {
        replayCurrent();
        return;
      }
      dispatch(setYoutubeVideo(immediate));
      return;
    }
    if (manualEndRef.current) {
      userPausedRef.current = true;
      trackChangeUntilRef.current = 0;
      getActivePlayer()?.pauseVideo?.();
      dispatch(playPause(false));
      return;
    }
    const extras = await extendQueueRef.current();
    const next = getNextVideo() || extras[0];
    if (next) {
      dispatch(setYoutubeVideo(next));
      return;
    }
    const list = Array.isArray(queueRef.current) ? queueRef.current : [];
    const fallback = list.find((item) => item?.id && item.id !== current?.id) || list[0];
    if (fallback && fallback.id !== current?.id) {
      dispatch(setYoutubeVideo(fallback));
      return;
    }
    replayCurrent();
  };
  playNextOrContinueRef.current = playNextOrContinue;

  const handleNextRef = useRef(() => {});
  const handlePrevRef = useRef(() => {});

  useEffect(() => {
    if (!video?.id || isJamGuest || repeat || queueManualEnd || oneMoreArmed) return;
    if (remainingAfterCurrent() > 2) return;
    void extendQueueRef.current();
  }, [isJamGuest, video?.id, safeQueue.length, repeat, queueManualEnd, oneMoreArmed]);

  const searchForQueueTracks = async () => {
    const query = addQuery.trim();
    if (!query || addSearching) return;
    setAddSearching(true);
    setAddSearchError("");
    try {
      const data = await requestJson(
        `/api/youtube-search?type=video&q=${encodeURIComponent(query)}`,
        {
          fallbackTitle: "Queue search is temporarily unavailable",
          fallbackMessage: "We couldn’t search for tracks. Please try again.",
        },
      );
      const results = Array.isArray(data?.results) ? data.results : [];
      setAddResults(results.filter((item) => item?.id).slice(0, 6).map((item) => decodeTrackFields(item)));
    } catch (error) {
      setAddResults([]);
      setAddSearchError("We couldn’t search for tracks. Please try again.");
    } finally {
      setAddSearching(false);
    }
  };

  const handleAddSearch = (event) => {
    event.preventDefault();
    void searchForQueueTracks();
  };

  const handleAddTrack = (track) => {
    if (jamLocked) return;
    if (jam?.status === "connected") jam.enqueue(track);
    else dispatch(addToQueue(track));
    setAddResults((current) => current.filter((item) => item.id !== track.id));
  };

  const overlaySheet = Boolean(expanded && isNarrow && !dataSaver && !audioOnly);
  useDismissOnOutside(showQueue && !overlaySheet, () => setShowQueue(false), [queueMenuRef, queuePanelRef]);
  useDismissOnOutside(
    Boolean(showLyrics && !overlaySheet && !isPhone),
    () => setShowLyrics(false),
    [queueMenuRef, lyricsPanelRef],
  );
  useDismissOnOutside(Boolean(overlaySheet && mobileSheet), () => setMobileSheet(false), [queueMenuRef, sheetRef]);

  useEffect(() => {
    const ms = showLyrics || pipWindow || pipFloat ? 120 : 500;
    const interval = window.setInterval(() => tickRef.current(), ms);
    return () => window.clearInterval(interval);
  }, [showLyrics, pipWindow, pipFloat]);

  useEffect(() => {
    const queueRemotePlayback = (event) => {
      const detail = event.detail;
      if (!detail?.videoId || typeof detail.isPlaying !== "boolean") return;
      pendingJamPlaybackRef.current = {
        videoId: detail.videoId,
        isPlaying: detail.isPlaying,
      };
      tickRef.current();
    };
    const queueRemoteSeek = (event) => {
      const detail = event.detail;
      const time = Number(detail?.currentTime);
      if (!detail?.videoId || !Number.isFinite(time) || time < 0) return;
      pendingJamSeekRef.current = {
        videoId: detail.videoId,
        currentTime: time,
      };
      tickRef.current();
    };
    window.addEventListener(JAM_REMOTE_PLAYBACK_EVENT, queueRemotePlayback);
    window.addEventListener(JAM_REMOTE_SEEK_EVENT, queueRemoteSeek);
    return () => {
      window.removeEventListener(JAM_REMOTE_PLAYBACK_EVENT, queueRemotePlayback);
      window.removeEventListener(JAM_REMOTE_SEEK_EVENT, queueRemoteSeek);
    };
  }, []);

  useEffect(() => {
    applyPlaybackVolume(getActivePlayer());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbackVolume, masterVolume]);

  useEffect(() => {
    requestYouTubeQuality(getActivePlayer(), requestedYouTubeQuality);
    reportPlaybackQuality(getActivePlayer(), activeDeckRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedYouTubeQuality]);

  useEffect(() => {
    applyYouTubeCaptions(getActivePlayer(), captionsEnabled && !karaokeHasLines);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captionsEnabled, karaokeHasLines]);

  useEffect(() => {
    const onTheater = (event) => setMediaTheater(event.detail?.active === true);
    window.addEventListener("heykasa:media-theater", onTheater);
    return () => window.removeEventListener("heykasa:media-theater", onTheater);
  }, []);

  useEffect(() => {
    oneMoreArmedRef.current = false;
    setOneMoreArmed(false);
    setOneMoreSuggestion(null);
    oneMoreSuggestionRef.current = null;
    setOneMorePrefetch(null);
    oneMorePrefetchRef.current = null;
  }, [videoId]);

  useEffect(() => {
    if (!oneMoreArmed || !video?.id || isJamGuest || queueManualEnd) {
      setOneMorePrefetch(null);
      oneMorePrefetchRef.current = null;
      return undefined;
    }
    let active = true;
    const seed = `${String(video.title || "").replace(/\s*[\(\[][^)\]]*[\)\]]/g, " ").trim()} similar songs`.trim();
    requestJson(`/api/youtube-search?type=video&q=${encodeURIComponent(seed || "popular music mix")}`, {
      fallbackTitle: "Related song unavailable",
      fallbackMessage: "We couldn’t find a last song to suggest.",
    })
      .then((data) => {
        if (!active) return;
        const next = pickOneMoreTrack(data?.results, {
          currentId: video.id,
          queuedIds: (queueRef.current || []).map((item) => item.id),
        });
        oneMorePrefetchRef.current = next;
        setOneMorePrefetch(next);
      })
      .catch(() => {
        if (!active) return;
        oneMorePrefetchRef.current = null;
        setOneMorePrefetch(null);
      });
    return () => { active = false; };
  }, [isJamGuest, oneMoreArmed, queueManualEnd, video?.id, video?.title]);

  useEffect(() => {
    if (!dataSaver && !audioOnly) return undefined;
    setExpanded(false);
    setImmersive(false);
    immersiveRef.current = false;
    pendingLyricsSheetRef.current = false;
    setMobileSheet(false);
    setShowLyrics(false);
    setShowQueue(false);
    dispatch(setFullScreen(false));
    return undefined;
  }, [dataSaver, audioOnly, dispatch]);

  useEffect(() => {
    if (!isPhone || !showLyrics) return undefined;
    setShowLyrics(false);
    return undefined;
  }, [isPhone, showLyrics]);

  useEffect(() => {
    if (!videoId || !apiReady || transitionMode === "off" || dataSaver) return;
    const timer = window.setTimeout(
      () => preloadNextRef.current(getNextVideo()),
      PRELOAD_START_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [videoId, queue, apiReady, transitionMode, dataSaver]);

  useEffect(() => {
    if (crossfadeInProgressRef.current || isSeekGuarded()) return;
    const player = getActivePlayer();
    if (!player?.getPlayerState) return;
    if (isPlaying) {
      userPausedRef.current = false;
      if (!isPageHidden()) resumePlayer(player);
      return;
    }
    if (userPausedRef.current && !fadeTimerRef.current) {
      player.pauseVideo();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  useEffect(() => {
    const resumeAfterBackground = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        if (!userPausedRef.current && (isPlayingRef.current || pageHiddenWhilePlayingRef.current)) {
          pageHiddenWhilePlayingRef.current = true;
        }
        return;
      }
      if (!pageHiddenWhilePlayingRef.current) return;
      pageHiddenWhilePlayingRef.current = false;
      if (userPausedRef.current) return;
      resumePlayer(getActivePlayer());
      dispatch(playPause(true));
    };
    const markHidden = () => {
      if (!userPausedRef.current && isPlayingRef.current) {
        pageHiddenWhilePlayingRef.current = true;
      }
    };
    document.addEventListener("visibilitychange", resumeAfterBackground);
    window.addEventListener("focus", resumeAfterBackground);
    window.addEventListener("pageshow", resumeAfterBackground);
    window.addEventListener("pagehide", markHidden);
    document.addEventListener("freeze", markHidden);
    document.addEventListener("resume", resumeAfterBackground);
    return () => {
      document.removeEventListener("visibilitychange", resumeAfterBackground);
      window.removeEventListener("focus", resumeAfterBackground);
      window.removeEventListener("pageshow", resumeAfterBackground);
      window.removeEventListener("pagehide", markHidden);
      document.removeEventListener("freeze", markHidden);
      document.removeEventListener("resume", resumeAfterBackground);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  // Fade a newly-started track in from silence (song B after song A ends, or a manual pick).
  useEffect(() => {
    endFadeVideoRef.current = null;
    if (fadeEnabled === false || !video?.id) return undefined;
    applyPlaybackVolume(getActivePlayer(), 0);
    let cancelled = false;
    let attempts = 0;
    const tryFadeIn = () => {
      if (cancelled) return;
      const player = getActivePlayer();
      const ready = player?.getPlayerState?.() === window.YT?.PlayerState?.PLAYING
        && playerVideoId(player) === video.id;
      if (ready) {
        rampVolume(player, 0, 1);
        return;
      }
      attempts += 1;
      if (attempts < 50) window.setTimeout(tryFadeIn, 150);
    };
    tryFadeIn();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video?.id]);

  const seekOnCurrentTrack = (nextTime, { dragging = false } = {}) => {
    if (isJamGuestRef.current) return;
    cancelFade();
    endFadeVideoRef.current = null;
    const player = getActivePlayer();
    const dur = player?.getDuration?.() || 0;
    const raw = Math.max(0, Number(nextTime) || 0);
    const time = dur > 1 ? Math.min(raw, dur - 0.25) : raw;
    hushIdleDeck();
    preloadedIdRef.current = null;
    const requestedFadeSeconds = Number(crossfadeSeconds) || 0;
    skipCrossfadeVideoRef.current =
      videoRef.current?.id &&
      dur > 0 &&
      dur - time <= Math.max(20, requestedFadeSeconds + 8)
        ? videoRef.current.id
        : null;
    markSeek(time, dragging);
    setCurrentTime(time);
    const want = videoRef.current?.id;
    try {
      const loadedId = playerVideoId(player);
      if (want && loadedId && loadedId !== want) {
        player.loadVideoById?.({ videoId: want, startSeconds: time });
      } else {
        player?.seekTo?.(time, true);
      }
      if (isPlayingRef.current) {
        player?.unMute?.();
        applyPlaybackVolume(player);
        player?.playVideo?.();
      }
    } catch (error) {
      // Player may still be loading the current video.
    }
  };

  const handlePlayPause = () => {
    if (isJamGuestRef.current) return;
    if (sleep.check()) return;
    abortCrossfade();
    cancelFade();
    const player = getActivePlayer();

    if (isPlaying) {
      userPausedRef.current = true;
      pageHiddenWhilePlayingRef.current = false;
      dispatch(playPause(false));
      player?.pauseVideo?.();
      return;
    }

    userPausedRef.current = false;
    dispatch(playPause(true));
    if (!player?.playVideo) return;
    player.unMute?.();
    applyPlaybackVolume(player);
    player.playVideo();
  };

  const handleRetryPlayback = () => {
    const current = videoRef.current;
    if (!current?.id) return;
    abortCrossfade();
    setPlayerError(null);
    markExpectPlaying();
    dispatch(playPause(true));
    const player = getActivePlayer();
    if (!player?.playVideo) {
      if (apiReady) mountDeck(activeDeckRef.current, current.id, { title: current.title });
      return;
    }
    const resumeAt = Math.max(0, player.getCurrentTime?.() || currentTime || 0);
    if (playerVideoId(player) !== current.id) {
      player.loadVideoById?.({ videoId: current.id, startSeconds: resumeAt });
    }
    player.unMute?.();
    applyPlaybackVolume(player);
    player.playVideo();
  };

  // Ramp the outgoing track down before a manual skip, then restore the level if the queue had nowhere to go.
  const fadeOutThenSkip = (run) => {
    const player = getActivePlayer();
    const seconds = Math.min(Number(fadeSeconds) || 0, MAX_SKIP_FADE_SECONDS);
    if (fadeEnabled === false || !player || !isPlaying || seconds < 0.05) {
      run();
      return;
    }
    const fromId = videoRef.current?.id;
    rampVolume(player, 1, 0, {
      durationMs: seconds * 1000,
      onDone: () => {
        run();
        window.setTimeout(() => {
          if (videoRef.current?.id === fromId && !fadeTimerRef.current) {
            applyPlaybackVolume(getActivePlayer(), 1);
          }
        }, 250);
      },
    });
  };

  const handleNext = ({ completed = false } = {}) => {
    if (isJamGuestRef.current) {
      jamRef.current?.requestAuxSkip?.();
      return;
    }
    if (!completed) {
      oneMoreArmedRef.current = false;
      setOneMoreArmed(false);
      setOneMoreSuggestion(null);
      oneMoreSuggestionRef.current = null;
    }
    // A finished track has already faded out via the near-end ramp.
    if (completed) {
      void playNextOrContinue(completed);
      return;
    }
    fadeOutThenSkip(() => {
      void playNextOrContinue(completed);
    });
  };
  handleNextRef.current = handleNext;

  useEffect(() => {
    const skip = () => handleNextRef.current();
    window.addEventListener(JAM_AUX_SKIP_EVENT, skip);
    window.addEventListener(DESKTOP_SKIP_EVENT, skip);
    return () => {
      window.removeEventListener(JAM_AUX_SKIP_EVENT, skip);
      window.removeEventListener(DESKTOP_SKIP_EVENT, skip);
    };
  }, []);

  const handleSkipPlaybackFailure = () => {
    if (isJamGuestRef.current) {
      jamRef.current?.requestAuxSkip?.();
      return;
    }
    setPlayerError(null);
    void playNextOrContinue();
  };

  const handlePrev = () => {
    if (isJamGuestRef.current) return;
    if (currentTime > 3) {
      seekOnCurrentTrack(0);
      return;
    }
    fadeOutThenSkip(() => {
      const previous = getPreviousVideo();
      if (!previous) {
        seekOnCurrentTrack(0);
        return;
      }
      if (status === "authenticated" && videoRef.current?.id) {
        recordPlayEvent(videoRef.current.id, "skipped");
      }
      markExpectPlaying();
      dispatch(playPause(true));
      dispatch(setYoutubeVideo(previous));
    });
  };

  handlePrevRef.current = handlePrev;

  useEffect(() => {
    const prev = () => handlePrevRef.current();
    window.addEventListener(DESKTOP_PREV_EVENT, prev);
    return () => window.removeEventListener(DESKTOP_PREV_EVENT, prev);
  }, []);

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
      const { PIP_DOCUMENT_STYLES } = await import("@/components/MusicPlayer/PictureInPictureWindow");
      const style = pip.document.createElement("style");
      style.textContent = PIP_DOCUMENT_STYLES;
      pip.document.head.appendChild(style);
      const mount = pip.document.createElement("div");
      mount.id = "HayKasa-pip";
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
    if (pictureInPicture === false || (!dataSaver && !audioOnly)) return;
    if (pipWindowRef.current || pipFloat) {
      closePictureInPicture();
      return;
    }
    abortCrossfade();
    const opened = await openDocumentPip();
    if (!opened) setPipFloat(true);
  };

  const playQueueItem = (item) => {
    if (!item?.id || isJamGuestRef.current) return;
    if (status === "authenticated" && video?.id) recordPlayEvent(video.id, "skipped");
    abortCrossfade();
    markExpectPlaying();
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
      immersiveRef.current = false;
      setImmersive(false);
      if (isPhoneRef.current) {
        setSheetTab(syncedLyrics !== false ? "lyrics" : "queue");
        setMobileSheet(true);
        return;
      }
      setMobileSheet(true);
      setShowQueue(true);
      setShowLyrics(syncedLyrics !== false);
      return;
    }
    if (delta > 56) {
      if (mobileSheet) {
        setMobileSheet(false);
        setShowQueue(false);
        setShowLyrics(false);
        return;
      }
      if (isPhoneRef.current && immersiveRef.current) {
        immersiveRef.current = false;
        setImmersive(false);
        bumpExpandedChromeRef.current({ reveal: true });
        return;
      }
      if (isPhoneRef.current) {
        toggleExpandedRef.current();
        return;
      }
      setMobileSheet(false);
      setShowQueue(false);
      setShowLyrics(false);
    }
  };

  const toggleLyrics = () => {
    if (syncedLyrics === false) return;
    if (isPhoneRef.current) {
      if (expandLockRef.current && !expanded) return;
      if (!expanded) {
        pendingLyricsSheetRef.current = true;
        toggleExpandedRef.current();
        return;
      }
      if (mobileSheet && sheetTab === "lyrics") {
        setMobileSheet(false);
        return;
      }
      setSheetTab("lyrics");
      setMobileSheet(true);
      return;
    }
    setShowLyrics((value) => !value);
  };

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
    seekGuardRef.current.until = performance.now() + SEEK_GUARD_MS;
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!video) return;
      const target = event.target;
      if (isEditableKeyboardTarget(target) || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (expanded) bumpExpandedChromeRef.current();

      if (event.code === "Space") {
        if (isActionKeyboardTarget(target)) return;
        event.preventDefault();
        handlePlayPause();
        return;
      }

      if (event.key === "Escape") {
        if (showQueue && !overlaySheet) {
          event.preventDefault();
          setShowQueue(false);
          return;
        }
        if (showLyrics && !overlaySheet && !isPhoneRef.current) {
          event.preventDefault();
          setShowLyrics(false);
          return;
        }
        if (overlaySheet && mobileSheet) {
          event.preventDefault();
          setMobileSheet(false);
          return;
        }
        if (isPhoneRef.current && immersiveRef.current) {
          event.preventDefault();
          bumpExpandedChromeRef.current({ reveal: true });
          return;
        }
        if (expanded) {
          event.preventDefault();
          toggleExpanded();
        }
        return;
      }

      if (!letterShortcutsEnabled) return;

      if (event.key === "m" || event.key === "M") {
        const player = getActivePlayer();
        if (!player) return;
        if (player.isMuted?.()) player.unMute?.();
        else player.mute?.();
      } else if (event.key === "f" || event.key === "F" || event.key === "v" || event.key === "V") {
        if (mediaTheater || document.querySelector("[data-testid=\"kasa-media-overlay\"]")) return;
        if (!dataSaver && !audioOnly) toggleExpanded();
      } else if (event.key === "j" || event.key === "J") {
        seekBy(-10);
      } else if (event.key === "l" || event.key === "L") {
        seekBy(10);
      } else if (event.shiftKey && (event.key === "N" || event.key === "n")) {
        handleNext();
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
      title: video.title || "HayKasa",
      artist: video.channel || "",
      artwork: video.thumbnail
        ? [{ src: video.thumbnail, sizes: "480x360", type: "image/jpeg" }]
        : [],
    });
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
    const setAction = (action, handler) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {}
    };
    setAction("play", () => {
      if (isJamGuestRef.current || sleep.check()) return;
      userPausedRef.current = false;
      if (isPageHidden()) {
        // The YouTube engine resumes when the page is visible. Do not claim
        // playback started while resumePlayer deliberately defers that call.
        markBackgroundPlayback();
        return;
      }
      dispatch(playPause(true));
      resumePlayer(getActivePlayer());
    });
    setAction("pause", () => {
      if (isJamGuestRef.current) return;
      // A notification/headset Pause is explicit user intent even when hidden.
      userPausedRef.current = true;
      pageHiddenWhilePlayingRef.current = false;
      clearActiveBufferTimers();
      navigator.mediaSession.playbackState = "paused";
      dispatch(playPause(false));
      getActivePlayer()?.pauseVideo?.();
    });
    setAction("stop", () => {
      if (isJamGuestRef.current) return;
      userPausedRef.current = true;
      pageHiddenWhilePlayingRef.current = false;
      dispatch(playPause(false));
      getActivePlayer()?.pauseVideo?.();
      seekOnCurrentTrack(0);
    });
    setAction("previoustrack", handlePrev);
    setAction("nexttrack", handleNext);
    setAction("seekbackward", (details) => seekBy(-(details?.seekOffset || 10)));
    setAction("seekforward", (details) => seekBy(details?.seekOffset || 10));
    setAction("seekto", (details) => {
      if (Number.isFinite(details?.seekTime)) seekOnCurrentTrack(details.seekTime);
    });
    return () => {
      ["play", "pause", "stop", "previoustrack", "nexttrack", "seekbackward", "seekforward", "seekto"]
        .forEach((action) => setAction(action, null));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video, isPlaying]);

  const mediaPosition = Math.max(0, Math.floor(Number(currentTime) || 0));
  useEffect(() => {
    if (!("mediaSession" in navigator) || !video || !(duration > 0)) return;
    try {
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate: 1,
        position: Math.min(mediaPosition, duration),
      });
    } catch {
      // setPositionState is unsupported here.
    }
  }, [duration, mediaPosition, video]);

  const enterIdleChrome = () => {
    if (isPhoneRef.current) {
      immersiveRef.current = true;
      setImmersive(true);
    }
    chromeVisibleRef.current = false;
    setChromeVisible(false);
  };

  const bumpExpandedChrome = (options = {}) => {
    const isFullscreen = expanded && !dataSaver && !audioOnly;
    if (!isFullscreen) return;
    if (options.pin) chromePinnedRef.current = true;
    window.clearTimeout(chromeIdleTimerRef.current);
    chromeHideGenRef.current += 1;
    const hideGeneration = chromeHideGenRef.current;
    if (isPhoneRef.current && immersiveRef.current && !options.reveal) return;
    if (options.reveal) {
      immersiveRef.current = false;
      setImmersive(false);
    }
    chromeVisibleRef.current = true;
    setChromeVisible(true);
    if (chromePinnedRef.current || chromeLockedRef.current) return;
    chromeIdleTimerRef.current = window.setTimeout(() => {
      if (hideGeneration !== chromeHideGenRef.current) return;
      if (chromePinnedRef.current || chromeLockedRef.current) return;
      enterIdleChrome();
    }, CHROME_IDLE_MS);
  };
  bumpExpandedChromeRef.current = bumpExpandedChrome;

  const pinExpandedChrome = () => {
    chromePinnedRef.current = true;
    bumpExpandedChrome({ pin: true });
  };
  const unpinExpandedChrome = () => {
    chromePinnedRef.current = false;
    bumpExpandedChrome();
  };

  useEffect(() => () => window.clearTimeout(chromeIdleTimerRef.current), []);

  useEffect(() => {
    if (!expanded || dataSaver || audioOnly) {
      chromePinnedRef.current = false;
      chromeVisibleRef.current = true;
      setChromeVisible(true);
      immersiveRef.current = false;
      setImmersive(false);
      window.clearTimeout(chromeIdleTimerRef.current);
      return;
    }
    bumpExpandedChromeRef.current();
  }, [expanded, dataSaver, audioOnly, video?.id]);

  useEffect(() => {
    if (chromeLockedRef.current) {
      chromePinnedRef.current = true;
      chromeVisibleRef.current = true;
      setChromeVisible(true);
      immersiveRef.current = false;
      setImmersive(false);
      window.clearTimeout(chromeIdleTimerRef.current);
      return;
    }
    chromePinnedRef.current = false;
    if (expanded && !dataSaver && !audioOnly) bumpExpandedChromeRef.current();
  }, [playerError, mobileSheet, expanded, dataSaver, audioOnly]);

  if (!video?.id) return null;

  const videoVisible = !dataSaver && !audioOnly;
  const deliveredQualityLabel = YOUTUBE_QUALITY_LABELS[deliveredVideoQuality] || "";
  const outgoingOpacity = 1 - fadeProgress;
  const incomingOpacity = fadeProgress;

  const toggleExpanded = () => {
    if (dataSaver || audioOnly) return;
    if (expandLockRef.current) return;
    const next = !expanded;
    expandLockRef.current = true;
    window.setTimeout(() => {
      expandLockRef.current = false;
    }, 1500);
    immersiveRef.current = false;
    setImmersive(false);
    if (next) {
      if (pendingLyricsSheetRef.current) {
        pendingLyricsSheetRef.current = false;
        setSheetTab("lyrics");
        setMobileSheet(true);
      } else {
        setMobileSheet(false);
      }
    } else {
      pendingLyricsSheetRef.current = false;
      setMobileSheet(false);
      setShowLyrics(false);
      setShowQueue(false);
    }
    setExpanded(next);
    dispatch(setFullScreen(next));
    if (next) closePictureInPicture();
    window.requestAnimationFrame(() => {
      const player = getActivePlayer();
      player?.unMute?.();
      applyPlaybackVolume(player);
      requestYouTubeQuality(player, requestedYouTubeQuality);
      reportPlaybackQuality(player, activeDeckRef.current);
      if (isPlaying) player?.playVideo?.();
    });
  };
  toggleExpandedRef.current = toggleExpanded;

  const fullscreen = expanded && videoVisible;
  const phoneSheet = Boolean(fullscreen && isPhone);
  const compactFullscreen = Boolean(fullscreen && isNarrow && !isLandscape && !isPhone);
  const sheetChrome = Boolean(fullscreen && isNarrow);
  const showDesktopQueue = showQueue && !sheetChrome;
  const expandedLayout = !fullscreen
    ? undefined
    : phoneSheet
      ? (isLandscape ? "phone-landscape" : "phone-portrait")
      : compactFullscreen
        ? "compact"
        : "theater";

  const togglePhoneImmersive = () => {
    if (!phoneSheet) return;
    if (immersiveRef.current) {
      bumpExpandedChrome({ reveal: true });
      return;
    }
    window.clearTimeout(chromeIdleTimerRef.current);
    chromeHideGenRef.current += 1;
    enterIdleChrome();
  };

  const dismissPlayerOverlays = () => {
    setMobileSheet(false);
    setShowQueue(false);
    if (!sheetChrome) setShowLyrics(false);
  };

  const handleVideoSurfaceTap = () => {
    if (!fullscreen) {
      toggleExpanded();
      return;
    }
    if (mobileSheet || showDesktopQueue || (showLyrics && !sheetChrome)) {
      dismissPlayerOverlays();
      return;
    }
    if (phoneSheet) {
      togglePhoneImmersive();
      return;
    }
    if (chromeVisible) enterIdleChrome();
    else bumpExpandedChrome({ reveal: true });
  };
  const toggleShuffle = () => {
    if (isJamGuest) return;
    if (!shuffle) {
      unshuffledRef.current = safeQueue.map((track) => track.id);
      dispatch(setYoutubeQueue(shuffleUpcoming(safeQueue, video.id)));
    } else {
      const originalOrder = new Map(unshuffledRef.current.map((id, index) => [id, index]));
      dispatch(setYoutubeQueue([...safeQueue].sort((first, second) =>
        (originalOrder.get(first.id) ?? Infinity) - (originalOrder.get(second.id) ?? Infinity))));
    }
    setShuffle(!shuffle);
  };
  const currentQueueIndex = safeQueue.findIndex((item) => item.id === video.id);
  const upcoming = currentQueueIndex === -1 ? safeQueue : safeQueue.slice(currentQueueIndex + 1);
  const queueControls = {
    track: video, queue: safeQueue, disabled: jamLocked, onSelect: playQueueItem,
    canUndoQueue: Boolean(queueUndo),
    onQueueEdit: (edit) => {
      if (jamLocked) return;
      if (edit.kind === "clear") { manualEndRef.current = true; setRepeat(false); }
      dispatch(editQueue({ ...edit, now: Date.now() }));
    },
    onQueueUndo: () => { if (!jamLocked) dispatch(undoQueueEdit({ now: Date.now() })); },
    onSaveQueue: status === "authenticated" ? async (name) => {
      const result = await createPlaylist(name, { songs: safeQueue.map((track) => track.id) });
      if (!result?.success) throw new Error(result?.message || "Playlist could not be saved.");
      window.dispatchEvent(new Event("heykasa:playlists-changed"));
    } : undefined,
  };
  const expandedChromePointer = {
    onPointerEnter: (event) => {
      if (event.pointerType !== "touch") pinExpandedChrome();
    },
    onPointerLeave: (event) => {
      if (event.pointerType !== "touch") unpinExpandedChrome();
    },
    onPointerDown: () => pinExpandedChrome(),
    onPointerUp: (event) => {
      if (event.pointerType === "touch") unpinExpandedChrome();
    },
  };

  const toggleSheetTab = (tab) => {
    if (mobileSheet && sheetTab === tab) {
      setMobileSheet(false);
      return;
    }
    setSheetTab(tab);
    setMobileSheet(true);
  };

  const dockedLyricsPanel = showLyrics && syncedLyrics !== false && !sheetChrome && !isPhone ? (
    <div ref={lyricsPanelRef} className={fullscreen ? "lyrics-panel lyrics-panel--expanded" : "lyrics-panel"}>
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
  ) : null;

  return (
    <div
      data-testid="youtube-player"
      data-chrome={fullscreen ? (chromeVisible ? "visible" : "hidden") : undefined}
      data-immersive={phoneSheet ? (immersive ? "true" : "false") : undefined}
      data-layout={expandedLayout}
      className={fullscreen ? `yt-video-expanded relative flex h-[100dvh] min-h-0 w-full shrink-0 flex-col overflow-hidden bg-black ${phoneSheet ? "yt-video-expanded--phone" : compactFullscreen ? "yt-video-expanded--compact" : "yt-video-expanded--theater"}${chromeVisible ? "" : " yt-video-expanded--idle"}` : "yt-player--docked relative w-full"}
      onClick={(event) => event.stopPropagation()}
      onPointerMove={fullscreen && !phoneSheet ? () => bumpExpandedChrome() : undefined}
      onTouchStart={fullscreen ? (event) => {
        if (!phoneSheet) bumpExpandedChrome();
        onFullscreenSwipeStart(event);
      } : undefined}
      onTouchEnd={fullscreen ? onFullscreenSwipeEnd : undefined}
    >
      <div className={phoneSheet ? "yt-phone-stage" : compactFullscreen ? "relative flex min-h-0 flex-1 flex-col overflow-hidden" : "contents"}>
      <div
        data-testid="youtube-decks"
        className={pipFloat && videoVisible ? "yt-crop yt-pip-float yt-video-floating bg-black" : phoneSheet ? "yt-crop yt-phone-video bg-black" : compactFullscreen ? "yt-crop relative min-h-[48vh] flex-1 bg-black" : fullscreen ? "yt-crop yt-expand-stage bg-black" : videoVisible ? "yt-crop yt-dock-preview bg-black" : "yt-crop yt-audio-stage"}
      >
        {["A", "B"].map((key) => (
          <div
            key={key}
            className="absolute inset-0 h-full w-full"
            style={{ opacity: key === activeDeck ? outgoingOpacity : incomingOpacity }}
          >
            <div
              ref={deckHostRefs[key]}
              className={`yt-crop-frame h-full w-full ${key === activeDeck ? `yt-crop-frame--${requestedYouTubeQuality}` : ""}`}
            />
          </div>
        ))}
        <div className="yt-chrome-mask" aria-hidden="true" />
        {karaokeSurface && captionsEnabled ? (
          <CaptionKaraoke currentTime={currentTime} enabled={karaokeSurface && captionsEnabled} lines={karaokeLines} />
        ) : null}
        {videoVisible && !pipFloat && !playerError && (
          <button
            type="button"
            data-testid="video-tap-target"
            aria-label={
              !fullscreen
                ? "Expand video"
                : !chromeVisible
                  ? "Show player controls"
                  : phoneSheet
                    ? "Watch video fullscreen"
                    : "Hide player controls"
            }
            className={`absolute inset-0 z-[16] border-0 bg-transparent ${fullscreen && !chromeVisible && !phoneSheet ? "cursor-none" : ""}`}
            onPointerMove={(event) => {
              event.stopPropagation();
              if (!phoneSheet && event.pointerType !== "touch") bumpExpandedChrome();
            }}
            onPointerDown={(event) => {
              event.stopPropagation();
              videoTapRef.current = {
                x: event.clientX,
                y: event.clientY,
                active: true,
                hadOverlay: Boolean(mobileSheet || showDesktopQueue || (showLyrics && !sheetChrome)),
              };
            }}
            onPointerUp={(event) => {
              event.stopPropagation();
              const start = videoTapRef.current;
              videoTapRef.current = { ...start, active: false };
              if (!start.active) return;
              const dx = event.clientX - start.x;
              const dy = event.clientY - start.y;
              if ((dx * dx) + (dy * dy) > 144) return;
              event.preventDefault();
              if (start.hadOverlay) {
                dismissPlayerOverlays();
                return;
              }
              handleVideoSurfaceTap();
            }}
          />
        )}
        {pipFloat && videoVisible && <div className="absolute inset-x-0 top-0 z-30 flex justify-end bg-gradient-to-b from-black/80 to-transparent">
          <button type="button" aria-label="Expand floating video" title="Expand video" onClick={toggleExpanded} className="grid h-12 w-12 place-items-center text-white hover:bg-white/20"><FiMaximize2 /></button>
          <button type="button" aria-label="Close floating video" title="Close floating video" onClick={closePictureInPicture} className="grid h-12 w-12 place-items-center text-white hover:bg-white/20"><FiX /></button>
        </div>}
        {playerError && (fullscreen || pipFloat) && (
          <div
            className="absolute inset-0 z-10 grid place-content-center bg-black/90 p-3 text-center"
            role="alert"
            aria-live="assertive"
            aria-atomic="true"
          >
            <p className="text-xs font-medium text-white">{playerError.message}</p>
            {playerError.detail && <p className="mt-1 text-xs text-gray-300">{playerError.detail}</p>}
            {playerError.kind === "autoplay" && (
              <p className="mt-1 text-[11px] text-gray-300">You may need to allow autoplay in your browser settings.</p>
            )}
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {playerError.canRetry !== false && <button type="button" onClick={handleRetryPlayback} className="min-h-12 rounded-md bg-[#00e6e6] px-3 text-xs font-semibold text-black hover:bg-[#33ebeb]">Retry</button>}
              <Link href={`/search/${encodeURIComponent(`${video.title || ""} ${video.channel || ""}`.trim().slice(0, 100))}`} className="inline-flex min-h-12 items-center rounded-md bg-white/10 px-3 text-xs font-semibold text-white">Search other versions</Link>
              <button type="button" onClick={handleSkipPlaybackFailure} disabled={jamLocked} className="min-h-12 rounded-md bg-white/10 px-3 text-xs font-semibold text-white hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40">Skip</button>
              <a href={`https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center rounded-md bg-white/10 px-3 text-xs font-semibold text-[#00e6e6] hover:bg-white/20">Open YouTube</a>
            </div>
          </div>
        )}
      </div>
      {playerError && !fullscreen && (
        <div
          className="yt-dock-feedback relative z-20 border-t border-white/10 bg-black/90 px-4 py-3 text-center"
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
        >
          <p className="text-sm font-medium text-white">{playerError.message}</p>
          {playerError.detail && <p className="mt-1 text-xs text-gray-300">{playerError.detail}</p>}
          {playerError.kind === "autoplay" && (
            <p className="mt-1 text-xs text-gray-300">You may need to allow autoplay in your browser settings.</p>
          )}
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {playerError.canRetry !== false && <button type="button" onClick={handleRetryPlayback} className="min-h-12 rounded-md bg-[#00e6e6] px-3 text-xs font-semibold text-black hover:bg-[#33ebeb]">Retry</button>}
            <Link href={`/search/${encodeURIComponent(`${video.title || ""} ${video.channel || ""}`.trim().slice(0, 100))}`} className="inline-flex min-h-12 items-center rounded-md bg-white/10 px-3 text-xs font-semibold text-white">Search other versions</Link>
            <button type="button" onClick={handleSkipPlaybackFailure} disabled={jamLocked} className="min-h-12 rounded-md bg-white/10 px-3 text-xs font-semibold text-white hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40">Skip</button>
            <a href={`https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center rounded-md bg-white/10 px-3 text-xs font-semibold text-[#00e6e6] hover:bg-white/20">Open YouTube</a>
          </div>
        </div>
      )}
      {!fullscreen && <PlayerDock
        track={video} playing={isPlaying} position={currentTime} duration={duration}
        disabled={isJamGuest} nextDisabled={jamLocked} shuffle={shuffle} repeat={repeat}
        onShuffle={toggleShuffle} onRepeat={() => setRepeat((value) => !value)}
        onPlayPause={handlePlayPause} onPrevious={handlePrev} onNext={() => handleNext()}
        onSeek={seekOnCurrentTrack} favourite={<FavouriteTrackButton track={video} className="!h-12 !w-12" />}
        volume={<PlayerVolume />} queue={safeQueue} onSelect={playQueueItem}
        onQueueEdit={queueControls.onQueueEdit} onQueueUndo={queueControls.onQueueUndo}
        canUndoQueue={queueControls.canUndoQueue} onSaveQueue={queueControls.onSaveQueue}
        trackActions={<AddToPlaylistButton track={video} className="!h-12 !w-12" />}
        queueSearch={<div className="mb-4 border-b border-white/10 pb-4">
          <form onSubmit={handleAddSearch} className="flex gap-2">
            <input aria-label="Find songs to add" value={addQuery} onChange={(event) => setAddQuery(event.target.value)} placeholder="Find a song" className="h-12 min-w-0 flex-1 rounded border border-white/20 bg-transparent px-3 text-sm" />
            <button type="submit" aria-label="Search queue additions" disabled={addSearching || jamLocked} className="grid h-12 w-12 place-items-center rounded bg-white/10 disabled:opacity-40"><FiSearch /></button>
          </form>
          {addSearchError && <p role="alert" className="mt-2 text-sm text-red-300">{addSearchError}</p>}
          {addResults.map((item) => <div key={item.id} className="mt-2 flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm">{item.title}</span>
            <button type="button" aria-label={`Add ${item.title} to queue`} onClick={() => handleAddTrack(item)} disabled={jamLocked} className="grid h-12 w-12 place-items-center rounded hover:bg-white/10"><FiPlus /></button>
          </div>)}
        </div>}
        onPip={togglePictureInPicture} pipActive={Boolean(pipWindow || pipFloat)}
        pipLabel={videoVisible ? "Picture in picture unavailable" : typeof window !== "undefined" && window.documentPictureInPicture?.requestWindow ? "Picture in picture controls" : "Floating player"}
        pipDisabled={pictureInPicture === false || videoVisible}
        onVideo={videoVisible ? toggleExpanded : undefined}
        onLyrics={syncedLyrics !== false ? toggleLyrics : undefined}
        onOneMore={!isJamGuest && queueMode !== "collection" && !queueManualEnd && !repeat ? () => {
          setOneMoreArmed((value) => {
            const next = !value;
            oneMoreArmedRef.current = next;
            if (!next) {
              setOneMoreSuggestion(null);
              oneMoreSuggestionRef.current = null;
            }
            return next;
          });
        } : undefined}
        oneMoreArmed={oneMoreArmed}
      />}
      {fullscreen && (
      <div className={phoneSheet ? "yt-phone-chrome" : "contents"} {...(phoneSheet && !chromeVisible ? { inert: true } : {})} aria-hidden={phoneSheet ? !chromeVisible : undefined}>
      {<div className={phoneSheet ? "yt-phone-chrome-title" : `yt-expand-chrome ${compactFullscreen ? "yt-expand-chrome--stack px-4 pt-4" : "pointer-events-none absolute inset-x-0 top-0 z-20 min-w-0 bg-gradient-to-b from-black/80 via-black/40 to-transparent px-4 pb-16 pt-[max(0.75rem,env(safe-area-inset-top))] pl-[max(1rem,env(safe-area-inset-left))] pr-28"}`} {...(!phoneSheet && !chromeVisible ? { inert: true } : {})} aria-hidden={!phoneSheet && !chromeVisible}>
        {fullscreen ? (
          <div>
            <p className="text-xs uppercase tracking-widest text-[#00e6e6]">Now playing</p>
            <p className={`mt-1 max-w-[70vw] truncate font-semibold text-white ${isShortViewport ? "text-sm" : "mt-2 text-lg"}`}>{video.title}</p>
            <p className={`truncate text-gray-300 ${isShortViewport ? "text-xs" : "text-sm"}`}>{video.channel}</p>
            {deliveredQualityLabel && (
              <p className="mt-1 text-[10px] font-medium text-[#9aa8b5]" aria-live="polite">
                Video: {deliveredQualityLabel}
              </p>
            )}
          </div>
        ) : (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{video.title}</p>
            <p className="truncate text-xs text-gray-400">{video.channel}</p>
            {videoVisible && deliveredQualityLabel && (
              <p className="mt-0.5 text-[10px] font-medium text-[#9aa8b5]" aria-live="polite">
                Video: {deliveredQualityLabel}
              </p>
            )}
          </div>
        )}
      </div>}
      {<div className={phoneSheet ? "yt-phone-chrome-transport" : `yt-expand-chrome ${compactFullscreen ? "yt-expand-chrome--stack px-4 pb-6 pt-2" : "absolute inset-x-0 bottom-0 z-20 mx-auto flex w-full max-w-[min(96vw,880px)] flex-col items-center gap-1 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-4 pb-[max(0.85rem,env(safe-area-inset-bottom))] pt-10"}`} {...(!phoneSheet && !chromeVisible ? { inert: true } : {})} aria-hidden={!phoneSheet && !chromeVisible} {...expandedChromePointer}>
        <div className={fullscreen ? "relative flex w-full items-center justify-center gap-1 text-gray-200" : "yt-dock-transport"}>
        {fullscreen && !phoneSheet && !compactFullscreen && !isShortViewport && <div className="pointer-events-none w-28 shrink-0 sm:w-36" />}
          <div className={fullscreen ? "flex max-w-full flex-wrap items-center justify-center gap-1 rounded-lg bg-[var(--glass-strong)] px-1 py-2 backdrop-blur sm:px-3" : "contents"}>
          <AddToPlaylistButton track={video} className="!h-12 !w-12 shrink-0 text-xl sm:!h-14 sm:!w-14" />
          <button type="button" aria-label="Previous song" title={isJamGuest ? "The host controls playback" : "Previous"} onClick={() => handlePrev()} disabled={isJamGuest} className="grid h-12 w-12 shrink-0 place-items-center rounded-full p-2 text-xl text-[var(--text)] hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 sm:h-14 sm:w-14"><FiSkipBack aria-hidden="true" /></button>
          <button type="button" aria-label="Seek back 10 seconds" title={isJamGuest ? "The host controls playback" : "Back 10 seconds"} onClick={() => seekBy(-10)} disabled={isJamGuest} className="hidden h-14 w-14 place-items-center rounded-full p-2 text-xl hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 sm:grid"><FiRotateCcw aria-hidden="true" /></button>
          <button type="button" aria-label={isPlaying ? "Pause" : "Play"} title={isJamGuest ? "The host controls playback" : isPlaying ? "Pause" : "Play"} onClick={handlePlayPause} disabled={isJamGuest} className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[var(--accent)] p-2 text-2xl text-[var(--navy)] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 sm:h-14 sm:w-14">{isPlaying ? <FiPause aria-hidden="true" /> : <FiPlay aria-hidden="true" />}</button>
          <button type="button" aria-label="Seek forward 10 seconds" title={isJamGuest ? "The host controls playback" : "Forward 10 seconds"} onClick={() => seekBy(10)} disabled={isJamGuest} className="hidden h-14 w-14 place-items-center rounded-full p-2 text-xl hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 sm:grid"><FiRotateCw aria-hidden="true" /></button>
          <button type="button" aria-label="Next song" title={jamLocked ? "The host controls playback" : "Next"} onClick={() => handleNext()} disabled={jamLocked} className="grid h-12 w-12 shrink-0 place-items-center rounded-full p-2 text-xl text-[var(--text)] hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 sm:h-14 sm:w-14"><FiSkipForward aria-hidden="true" /></button>
          <FavouriteTrackButton track={video} className="!h-12 !w-12 shrink-0 text-xl sm:!h-14 sm:!w-14" />
          </div>
          {fullscreen && !phoneSheet && !compactFullscreen && !isShortViewport && <div className="flex w-28 shrink-0 justify-end sm:w-36"><PlayerVolume /></div>}
        </div>
        <div className={fullscreen ? "w-full" : "yt-dock-seek"}>
          <input
            aria-label="YouTube song progress"
            type="range"
            min="0"
            max={safeMediaTime(duration)}
            value={Math.min(safeMediaTime(currentTime), safeMediaTime(duration))}
            disabled={isJamGuest}
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
      </div>}
      {<div ref={queueMenuRef} className={phoneSheet ? "yt-phone-chrome-tools" : `yt-expand-chrome ${compactFullscreen ? "absolute right-4 top-4 z-20 flex items-center justify-end gap-1" : "absolute right-[max(1rem,env(safe-area-inset-right))] top-[max(0.75rem,env(safe-area-inset-top))] z-20 flex items-center justify-end gap-1 sm:gap-2"}`} {...(!phoneSheet && !chromeVisible ? { inert: true } : {})} aria-hidden={!phoneSheet && !chromeVisible} {...expandedChromePointer}>
        <button
          type="button"
          aria-label="Queue"
          aria-expanded={sheetChrome ? mobileSheet && sheetTab === "queue" : showQueue}
          onClick={() => {
            if (sheetChrome) {
              toggleSheetTab("queue");
              return;
            }
            setShowQueue((value) => !value);
          }}
          className={expanded && !dataSaver && !audioOnly ? "flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-md bg-black/60 px-2 py-1 text-xs text-gray-300 hover:bg-white/10" : "flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-md px-2 py-1 text-xs text-gray-300 hover:bg-white/10"}
        >
          <span className="hidden lg:inline">Queue</span> {sheetChrome ? (mobileSheet && sheetTab === "queue" ? <FiChevronDown /> : <FiChevronUp />) : (showQueue ? <FiChevronDown /> : <FiChevronUp />)}
        </button>
        <button
          type="button"
          aria-pressed={sheetChrome ? mobileSheet && sheetTab === "lyrics" : showLyrics}
          aria-label={sheetChrome ? (mobileSheet && sheetTab === "lyrics" ? "Hide lyrics" : "Show live lyrics") : (showLyrics ? "Hide lyrics" : "Show live lyrics")}
          title={syncedLyrics === false ? "Live lyrics are turned off in Settings" : "Live lyrics"}
          disabled={syncedLyrics === false}
          onClick={() => {
            if (sheetChrome) {
              toggleSheetTab("lyrics");
              return;
            }
            toggleLyrics();
          }}
          className={expanded && !dataSaver && !audioOnly ? `grid min-h-11 min-w-11 place-items-center rounded-full bg-black/60 p-2 hover:bg-white/10 disabled:opacity-40 ${(sheetChrome ? mobileSheet && sheetTab === "lyrics" : showLyrics) ? "text-[#00e6e6]" : "text-white"}` : `grid min-h-11 min-w-11 place-items-center rounded-full p-2 hover:bg-white/10 disabled:opacity-40 ${showLyrics ? "text-[#00e6e6]" : "text-gray-300"}`}
        >
          <MdOutlineLyrics size={18} />
        </button>
        {!isJamGuest && queueMode !== "collection" && !queueManualEnd && !repeat ? (
          <button
            type="button"
            aria-pressed={oneMoreArmed}
            aria-label={oneMoreArmed ? "Cancel one more song" : "One more song"}
            title={oneMoreArmed ? "Cancel one more song" : "After this track, pause with one last suggestion"}
            onClick={() => {
              setOneMoreArmed((value) => {
                const next = !value;
                oneMoreArmedRef.current = next;
                if (!next) {
                  setOneMoreSuggestion(null);
                  oneMoreSuggestionRef.current = null;
                }
                return next;
              });
            }}
            className={expanded && !dataSaver && !audioOnly ? `grid min-h-11 min-w-11 place-items-center rounded-full bg-black/60 p-2 hover:bg-white/10 ${oneMoreArmed ? "text-[#00e6e6]" : "text-white"}` : `grid min-h-11 min-w-11 place-items-center rounded-full p-2 hover:bg-white/10 ${oneMoreArmed ? "text-[#00e6e6]" : "text-gray-300"}`}
          >
            <FiSquare size={16} />
          </button>
        ) : null}
        {!fullscreen && <PlayerVolume />}
        <button type="button" aria-label={expanded ? "Minimize video" : "Expand video"} title={expanded ? "Minimize video" : "Expand video"} onClick={toggleExpanded} disabled={dataSaver || audioOnly} className={expanded && !dataSaver && !audioOnly ? "grid min-h-11 min-w-11 place-items-center rounded-full bg-black/60 p-2 text-white hover:bg-white/10 disabled:opacity-40" : "grid min-h-11 min-w-11 place-items-center rounded-full p-2 text-gray-300 hover:bg-white/10 disabled:opacity-40"}>{expanded ? <FiMinimize2 /> : <FiMaximize2 />}</button>
        {showDesktopQueue && !fullscreen && (
          <div ref={queuePanelRef} className="absolute bottom-full right-0 z-30 mb-2 w-[min(92vw,360px)] rounded-xl border border-white/10 bg-[#07121d] p-3 shadow-2xl">
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[#00e6e6]">Queue</p>
            <div className="max-h-72 overflow-y-auto">
              {upcoming.length === 0 && <p className="px-1 py-3 text-xs text-gray-400">Queue is empty.</p>}
              {upcoming.slice(0, 12).map((item) => (
                <button key={item.id} type="button" onClick={() => playQueueItem(item)} disabled={isJamGuest} className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"><img src={item.thumbnail || THUMB_FALLBACK} alt="" onError={handleThumbError} className="h-9 w-9 rounded object-cover" /><span className="truncate text-xs text-white">{item.title}</span></button>
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
                    <img src={item.thumbnail || THUMB_FALLBACK} alt="" onError={handleThumbError} className="h-8 w-8 shrink-0 rounded object-cover" />
                    <span className="min-w-0 flex-1 truncate text-xs text-white">{item.title}</span>
                    <button type="button" aria-label={`Add ${item.title} to queue`} onClick={() => handleAddTrack(item)} disabled={jamLocked} className="shrink-0 rounded-full bg-[#00e6e6]/20 p-1 text-[#00e6e6] hover:bg-[#00e6e6]/30 disabled:cursor-not-allowed disabled:opacity-40">
                      <FiPlus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {addSearchError && (
              <div className="mt-2 flex items-center justify-between gap-3 rounded-md bg-red-500/10 px-2 py-1.5" role="alert">
                <p className="text-xs text-red-200">{addSearchError}</p>
                <button type="button" onClick={() => void searchForQueueTracks()} disabled={addSearching || !addQuery.trim()} className="shrink-0 rounded px-2 py-1 text-xs font-semibold text-[#00e6e6] hover:bg-white/10 disabled:opacity-50">Retry</button>
              </div>
            )}
          </div>
        )}
      </div>}
      </div>
      )}
      </div>
      {sheetChrome && mobileSheet && (
        <div ref={sheetRef} className="yt-mobile-sheet">
          <button
            type="button"
            aria-label="Close"
            className="yt-mobile-sheet-handle"
            onClick={() => setMobileSheet(false)}
          />
          <div className="flex w-full items-center justify-center">
            <button
              type="button"
              onClick={() => setSheetTab("queue")}
              className={`${sheetTab === "queue" ? "border-[#00e6e6] border-b-2" : ""} m-3 text-xl font-medium text-white`}
            >
              Queue
            </button>
            <button
              type="button"
              onClick={() => setSheetTab("lyrics")}
              className={`${sheetTab === "lyrics" ? "border-[#00e6e6] border-b-2" : ""} m-3 text-xl font-medium text-white`}
            >
              Lyrics
            </button>
            <button
              type="button"
              aria-label="Close panel"
              onClick={() => setMobileSheet(false)}
              className="absolute right-3 top-3 rounded-full p-1.5 text-gray-400 hover:bg-white/10 hover:text-white"
            >
              <FiX size={16} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {sheetTab === "queue" ? (
              <div className="px-4 pb-6"><QueueEditor {...queueControls} /></div>
            ) : syncedLyrics === false ? (
              <p className="px-4 py-6 text-center text-sm text-gray-400">Live lyrics are turned off in Settings.</p>
            ) : (
              <SyncedLyrics
                title={video.title}
                artist={video.channel}
                duration={duration}
                currentTime={currentTime}
                onSeek={seekOnCurrentTrack}
                className="h-full"
              />
            )}
          </div>
        </div>
      )}
      {showDesktopQueue && fullscreen && (
        <div ref={queuePanelRef} className="yt-queue-panel">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[#00e6e6]">Queue</p>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <QueueEditor {...queueControls} />
          </div>
        </div>
      )}
      {dockedLyricsPanel
        ? typeof document === "undefined"
          ? dockedLyricsPanel
          : createPortal(dockedLyricsPanel, document.body)
        : null}
      {pipFloat && !videoVisible && <FloatingPlayer track={video} playing={isPlaying} disabled={isJamGuest} onPlayPause={handlePlayPause} onNext={() => handleNext()} onClose={closePictureInPicture} />}
      {pipWindow && pipMountRef.current && (
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
      {oneMoreSuggestion && typeof document !== "undefined" ? createPortal(
        <div className="one-more-layer">
          <OneMoreSongCard
            track={oneMoreSuggestion}
            onPlay={(track) => {
              setOneMoreSuggestion(null);
              oneMoreSuggestionRef.current = null;
              oneMoreArmedRef.current = false;
              setOneMoreArmed(false);
              if (!track?.id) return;
              dispatch(startYoutubePlayback({
                track,
                queue: [track],
                queueMode: "collection",
                autoExtend: false,
                context: { type: "one-more", name: "One more song" },
              }));
            }}
            onDismiss={() => {
              setOneMoreSuggestion(null);
              oneMoreSuggestionRef.current = null;
            }}
          />
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

export default React.memo(YouTubePlayer);
