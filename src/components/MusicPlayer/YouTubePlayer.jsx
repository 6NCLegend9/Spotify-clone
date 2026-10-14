"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { isTrackAllowed } from "@/utils/explicitContent.mjs";
import {
  alternateSearchQuery,
  youtubePlaybackFailurePolicy,
  youtubeRecoveryScope,
  youtubeRecoveryScopeMatches,
} from "@/utils/youtubePlaybackError.mjs";
import PlayerDock from "./PlayerDock";
import { MEDIA_PLAYER_STATES } from "./media/mediaPlayerStates.mjs";
import { createNativeMediaDeck } from "./media/nativeMediaDeck.mjs";
import { automaticMediaHeight, supportedMediaProfile } from "./media/mediaCapabilities.mjs";
import PlaybackQualityControl from "./media/PlaybackQualityControl";
import {
  nextQueueTrack,
  queueAdvanceDecision,
  queueEntryIdentity,
  queueOccurrenceMatches,
  queueTrackIndex,
  restoreQueueOrder,
  shuffleUpcoming,
} from "@/utils/playerQueue.mjs";
import { useDispatch, useSelector, useStore } from "react-redux";
import { useSession } from "next-auth/react";
import { toast } from "react-hot-toast";
import {
  playPause,
  playPreviousFromHistory,
  setYoutubeVideo,
  replaceCurrentYoutubeTrack,
  setYoutubeQueue,
  addToQueue,
  appendToQueue,
  setPlaybackPosition,
  editQueue,
  undoQueueEdit,
  expireQueueUndo,
} from "@/redux/features/playerSlice";
import { createPlaylist } from "@/services/playlistApi";
import useListeningInsights from "@/hooks/useListeningInsights";
import { recordDiagnostic } from "@/utils/diagnostics.mjs";
import { FiPlus, FiSearch, FiX, FiMaximize2 } from "react-icons/fi";
import FavouriteTrackButton from "@/components/FavouriteTrackButton";
import AddToPlaylistButton from "@/components/AddToPlaylistButton";
const ClockedPictureInPictureWindow = dynamic(() => import("./ClockedPictureInPictureWindow"), { ssr: false });
const FloatingPlayer = dynamic(() => import("./FloatingPlayer"), { ssr: false });
import PlayerVolume from "@/components/MusicPlayer/PlayerVolume";
import { useJam } from "@/components/Jam/JamProvider";
import useSyncedLyrics from "@/hooks/useSyncedLyrics";
import { requestJson } from "@/services/http";
import { applyLatestOutputVolume, armVolumeRestore, youtubePlaybackVolume, bandsForPreset } from "@/utils/eqPresets";
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
import { buildRadioDiscoveryQueries, collectRadioArtistExclusions, diversifyRadioTracks, radioArtistIdentity } from "@/utils/radioSeed.mjs";
import { buildYoutubeSearchUrl } from "@/utils/youtubeSearchUrl.mjs";
import { createPlaybackClockStore, publishPlaybackTick } from "./playbackClock";
import useYoutubeCaptions from "@/hooks/useYoutubeCaptions";
import useWakeLock from "@/hooks/useWakeLock";
import useKeyboardShortcuts from "@/hooks/useKeyboardShortcuts";
import { updateSetting } from "@/redux/features/settingsSlice";
import { authenticatedPlaybackOwner, shouldDeferYoutubeResume } from "@/utils/youtubeResumePolicy.mjs";
import { isMobileMediaClient, mobileMediaHeaders } from "@/utils/mobileMediaPolicy.mjs";
import { publishMediaMetadata, publishMediaPlaybackState } from "@/utils/mediaSessionCompatibility.mjs";
import { shouldHoldPlaybackWakeLock } from "@/utils/wakeLockPolicy.mjs";
import { hiddenYoutubeViewportStyle, HIDDEN_YOUTUBE_VIEWPORT } from "@/utils/youtubePresentationPolicy.mjs";
const ClockedCaptionKaraoke = dynamic(() => import("./ClockedCaptionKaraoke"), { ssr: false });

const handleThumbError = (event) => {
  if (event.currentTarget.src !== THUMB_FALLBACK) {
    event.currentTarget.src = THUMB_FALLBACK;
  }
};

const safeMediaTime = (value) => {
  const next = Number(value);
  return Number.isFinite(next) && next >= 0 ? next : 0;
};

const requestMediaPresentation = (command) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("heykasa:media-presentation-command", {
    detail: { command },
  }));
};

const reportYoutubeProviderError = (code) => {
  if (typeof window === "undefined") return;
  const numericCode = Number(code);
  window.dispatchEvent(new CustomEvent("heykasa:youtube-provider-error", {
    detail: { code: Number.isFinite(numericCode) ? numericCode : 0 },
  }));
};

const otherDeck = (key) => (key === "A" ? "B" : "A");
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
  const store = useStore();
  const [shuffle, setShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState("off");
  const repeat = repeatMode !== "off";
  const repeatModeRef = useRef(repeatMode);
  repeatModeRef.current = repeatMode;
  const repeatRef = useRef(false);
  const unshuffledRef = useRef([]);
  repeatRef.current = repeat;
  const { data: session, status } = useSession();
  const jam = useJam();
  const { youtubeVideo: rawVideo, youtubeQueue: rawQueue, isPlaying, restorePosition, playbackOwner, queueUndo, queueManualEnd, queueMode, playbackContext, history: playbackHistory } = useSelector(
    (state) => state.player,
  );
  const backgroundAccountRef = useRef(false);
  backgroundAccountRef.current = authenticatedPlaybackOwner(session, status, playbackOwner);
  const video = useMemo(() => decodeTrackFields(rawVideo), [rawVideo]);
  const queue = useMemo(
    () => (Array.isArray(rawQueue) ? rawQueue.map((item) => decodeTrackFields(item)) : []),
    [rawQueue],
  );
  const {
    dataSaver,
    audioOnly,
    normalization,
    eqPreset,
    eqBands,
    monoAudio,
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
  const videoId = video?.id || "";
  const playbackVolume = youtubePlaybackVolume(undefined, normalization);
  const captionsEnabled = captions !== false;
  const letterShortcutsEnabled = keyboardShortcuts !== false;
  const isJamGuest = jam?.role === "guest" && Boolean(jam.code);
  const jamLocked = isJamGuest && jam?.hasAux !== true;
  const userPausedRef = useRef(false);
  const pageHiddenWhilePlayingRef = useRef(false);
  const volumeLevelsRef = useRef({ playbackVolume, masterVolume });
  const volumeRestoreRef = useRef({ clear() {}, holds() { return false; } });
  const lastShortcutVolumeRef = useRef(masterVolume > 0 ? masterVolume : 1);
  if (masterVolume > 0) lastShortcutVolumeRef.current = masterVolume;
  volumeLevelsRef.current = { playbackVolume, masterVolume };
  const trackChangeUntilRef = useRef(0);
  const insights = useListeningInsights({
    owner: playbackOwner,
    trackId: videoId,
    occurrenceId: video?.queueEntryId || videoId,
    enabled: status === "authenticated" && settingsOwner === playbackOwner && listeningInsights === true && !privateSession && !jam?.code,
    getSample: () => {
      const player = getActivePlayer();
      return { position: player?.getCurrentTime?.(), playing: player?.getPlayerState?.() === MEDIA_PLAYER_STATES.PLAYING && isPlayingRef.current };
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
  const handledOccurrenceRef = useRef(null);
  const tickRef = useRef(() => {});
  const pendingJamSeekRef = useRef(null);
  const pendingJamPlaybackRef = useRef(null);
  const lastJamPlaybackReportRef = useRef(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const playbackClockRef = useRef(null);
  if (!playbackClockRef.current) playbackClockRef.current = createPlaybackClockStore();
  const playbackClock = playbackClockRef.current;
  const lastUiClockCommitRef = useRef(0);
  const durationRef = useRef(0);
  durationRef.current = duration;
  const [apiReady, setApiReady] = useState(false);
  const [nativeAvailable, setNativeAvailable] = useState(false);
  const [mediaAsset, setMediaAsset] = useState(null);
  const [mediaQualities, setMediaQualities] = useState([]);
  const [qualitySelection, setQualitySelection] = useState("auto");
  const [sourceRevision, setSourceRevision] = useState(0);
  const sourceSwitchRef = useRef(null);
  const fallbackOccurrenceRef = useRef(null);
  const sourceContextRef = useRef("");
  const audioSettingsRef = useRef({});
  audioSettingsRef.current = { bands: bandsForPreset(eqPreset, eqBands), normalization, monoAudio };
  const [deliveredVideoQuality, setDeliveredVideoQuality] = useState("");
  const [playerError, setPlayerError] = useState(null);
  const [addQuery, setAddQuery] = useState("");
  const [addResults, setAddResults] = useState([]);
  const [addSearching, setAddSearching] = useState(false);
  const [addSearchError, setAddSearchError] = useState("");
  const [mediaTheater, setMediaTheater] = useState(false);
  const videoVisible = !dataSaver && !audioOnly && (!nativeAvailable || mediaTheater);
  useWakeLock(shouldHoldPlaybackWakeLock({ isPlaying, mediaTheater, videoVisible }));
  const karaokeHasLinesRef = useRef(false);
  const karaokeSurface = Boolean(mediaTheater);
  const karaokeLines = useYoutubeCaptions(videoId, karaokeSurface && captionsEnabled);
  const karaokeHasLines = karaokeLines.length > 0;
  karaokeHasLinesRef.current = karaokeHasLines;
  const autoExtendingRef = useRef(false);
  const lastExtendEmptyRef = useRef(false);
  const lastExtendAtRef = useRef(0);
  const extendQueueRef = useRef(async () => []);
  const playNextOrContinueRef = useRef(() => {});
  const pipWindowRef = useRef(null);
  const pipMountRef = useRef(null);
  const [pipWindow, setPipWindow] = useState(null);
  const [pipFloat, setPipFloat] = useState(false);
  const videoRef = useRef(video);
  const queueRef = useRef(queue);
  const isPlayingRef = useRef(isPlaying);
  const savedProgressRef = useRef({ identity: null, position: 0 });
  const isJamGuestRef = useRef(isJamGuest);
  const jamRef = useRef(jam);
  const seekGuardRef = useRef({ seeking: false, until: 0, target: null, videoId: null });
  const nearEndStreakRef = useRef(0);
  const endFadeOccurrenceRef = useRef(null);
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
  const activeTrackStartedRef = useRef({ identity: null, videoId: null, startedAt: 0 });
  const handoffTimerRef = useRef(null);
  const handoffWaitingRef = useRef(null);
  const endedTransitionRef = useRef(null);
  const sameIdRetryRef = useRef({ identity: null, videoId: null, attempts: 0 });
  const alternateAttemptRef = useRef({ identity: null, attempts: 0, rejectedIds: new Set() });
  const failureResolveRef = useRef(null);
  const handlePlaybackFailureRef = useRef(async () => {});
  videoRef.current = video;
  const safeQueue = useMemo(
    () => (Array.isArray(queue) ? queue.filter((item) => item?.id) : []),
    [queue],
  );
  queueRef.current = safeQueue;
  isPlayingRef.current = isPlaying;
  isJamGuestRef.current = isJamGuest;
  jamRef.current = jam;

  const syncPlaybackClock = (position, nextDuration, { commitUi = true } = {}) => {
    const nextPosition = safeMediaTime(position);
    const safeDuration = safeMediaTime(nextDuration);
    playbackClock.publish({ position: nextPosition, duration: safeDuration });
    durationRef.current = safeDuration;
    if (commitUi) {
      lastUiClockCommitRef.current = performance.now();
      setCurrentTime(nextPosition);
      setDuration(safeDuration);
    }
  };

  const syncPlaybackDuration = (nextDuration) => {
    const safeDuration = safeMediaTime(nextDuration);
    playbackClock.publish({
      position: playbackClock.read().position,
      duration: safeDuration,
    });
    if (durationRef.current !== safeDuration) {
      durationRef.current = safeDuration;
      setDuration(safeDuration);
    }
  };

  const lyricsQuery = useSyncedLyrics({
    title: video?.title || "",
    artist: video?.channel || "",
    duration,
    enabled: Boolean(video?.title) && syncedLyrics !== false && Boolean(pipWindow),
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

  const resumePlayer = (player, { explicitUserAction = false } = {}) => {
    const hidden = isPageHidden();
    if (shouldDeferYoutubeResume({ hidden, explicitUserAction, provider: player?.provider, authenticated: backgroundAccountRef.current })) {
      markBackgroundPlayback();
      return;
    }
    if (!player?.playVideo) return;
    try {
      // Some YouTube iframe transitions can reset the provider volume while
      // processing unMute(). Keep the current HayKasa level on both sides of
      // that command, then re-apply once more when a tab restore is active.
      applyPlaybackVolume(player);
      player.unMute?.();
      applyPlaybackVolume(player);
      player.playVideo();
      if (volumeRestoreRef.current.holds()) {
        window.requestAnimationFrame(() => {
          if (!volumeRestoreRef.current.holds()) return;
          if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
          applyPlaybackVolume(player);
        });
      }
      if (hidden) pageHiddenWhilePlayingRef.current = true;
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

  const getNextVideo = ({ avoidId = null } = {}) => {
    const currentIdentity = queueEntryIdentity(videoRef.current);
    if (!currentIdentity) return null;
    const list = Array.isArray(queueRef.current) ? queueRef.current : [];
    return nextQueueTrack(list, currentIdentity, repeatRef.current, { avoidId });
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
    // Background/focus listeners live longer than a single render. Read the
    // current levels at call time so they never restore the startup volume.
    applyLatestOutputVolume(player, player?.provider === "native" ? { ...volumeLevelsRef.current, playbackVolume: 100 } : volumeLevelsRef.current, ratio);
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
    if (player.getPlayerState?.() !== MEDIA_PLAYER_STATES.PLAYING) return false;
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
    if (player.getPlayerState?.() !== MEDIA_PLAYER_STATES.PLAYING) return false;
    const started = activeTrackStartedRef.current;
    const recovery = activeRecoveryRef.current;
    const now = performance.now();
    return (
      started.identity === queueEntryIdentity(videoRef.current) &&
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

  const resetActiveRecovery = (track = null) => {
    clearActiveBufferTimers();
    const recoveryScope = youtubeRecoveryScope(track);
    activeRecoveryRef.current = emptyRecovery(recoveryScope.videoId);
    if (!recoveryScope.identity || !recoveryScope.videoId) {
      sameIdRetryRef.current = { identity: null, videoId: null, attempts: 0 };
      alternateAttemptRef.current = { identity: null, attempts: 0, rejectedIds: new Set() };
      return;
    }
    if (!youtubeRecoveryScopeMatches(sameIdRetryRef.current, track)) {
      sameIdRetryRef.current = { ...recoveryScope, attempts: 0 };
    }
    if (alternateAttemptRef.current.identity !== recoveryScope.identity) {
      alternateAttemptRef.current = {
        identity: recoveryScope.identity,
        attempts: 0,
        rejectedIds: new Set([recoveryScope.videoId]),
      };
    } else {
      alternateAttemptRef.current.rejectedIds.add(recoveryScope.videoId);
    }
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
        player.getPlayerState?.() === MEDIA_PLAYER_STATES.PLAYING &&
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
    if (player?.provider === "native" && player.isResolving) return;
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
    const currentIdentity = queueEntryIdentity(videoRef.current);
    const recentlyStarted =
      activeTrack.identity === currentIdentity &&
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
        state === MEDIA_PLAYER_STATES.BUFFERING ||
        (
          stalledClock &&
          (
            state === MEDIA_PLAYER_STATES.PLAYING ||
            state === MEDIA_PLAYER_STATES.CUED ||
            state === MEDIA_PLAYER_STATES.UNSTARTED ||
            state === MEDIA_PLAYER_STATES.PAUSED
          )
        );
      if (!recoverable) return;

      const stillStarting =
        (activeTrackStartedRef.current.identity === queueEntryIdentity(videoRef.current) &&
          activeTrackStartedRef.current.videoId === videoId &&
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
        void handlePlaybackFailureRef.current?.({ code: "stall", kind: "playback" });
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
    if (player?.provider === "native" && player.isResolving) return;
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
   …19904 tokens truncated…ity = fadeProgress;

  const openVideoPresentation = () => {
    if (dataSaver || audioOnly) return;
    closePictureInPicture();
    requestMediaPresentation("expand");
  };

  const toggleShuffle = () => {
    if (isJamGuest) return;
    if (!shuffle) {
      unshuffledRef.current = safeQueue.map(queueEntryIdentity);
      dispatch(setYoutubeQueue(shuffleUpcoming(safeQueue, queueEntryIdentity(video))));
    } else {
      dispatch(setYoutubeQueue(restoreQueueOrder(safeQueue, unshuffledRef.current)));
    }
    setShuffle(!shuffle);
  };
  const currentQueueIndex = queueTrackIndex(safeQueue, video);
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
  return (
    <div
      data-testid="youtube-player"
      data-provider-quality={deliveredVideoQuality || undefined}
      className="yt-player--docked relative w-full"
      onClick={(event) => event.stopPropagation()}
    >
      <div
        data-testid="youtube-decks"
        style={!videoVisible ? hiddenYoutubeViewportStyle() : undefined}
        data-hidden-provider-width={!videoVisible ? HIDDEN_YOUTUBE_VIEWPORT.width : undefined}
        data-hidden-provider-height={!videoVisible ? HIDDEN_YOUTUBE_VIEWPORT.height : undefined}
        className={pipFloat && videoVisible
          ? "yt-crop yt-pip-float yt-video-floating bg-black"
          : videoVisible
            ? "yt-crop yt-dock-preview bg-black"
            : "yt-crop yt-audio-stage"}
      >
        {["A", "B"].map((key) => (
          <div
            key={key}
            className="absolute inset-0 h-full w-full"
            style={{ opacity: key === activeDeck ? outgoingOpacity : incomingOpacity }}
          >
            <div
              ref={deckHostRefs[key]}
              className="yt-crop-frame h-full w-full"
            />
          </div>
        ))}
        <div className="yt-chrome-mask" aria-hidden="true" />
        {karaokeSurface && captionsEnabled ? (
          <ClockedCaptionKaraoke clock={playbackClock} enabled={karaokeSurface && captionsEnabled} lines={karaokeLines} />
        ) : null}
        {videoVisible && !pipFloat && !playerError && (
          <button
            type="button"
            data-testid="video-tap-target"
            aria-label="Expand video"
            className="absolute inset-0 z-[16] border-0 bg-transparent"
            onClick={(event) => {
              event.stopPropagation();
              openVideoPresentation();
            }}
          />
        )}
        {pipFloat && videoVisible && (
          <div className="absolute inset-x-0 top-0 z-30 flex justify-end bg-gradient-to-b from-black/80 to-transparent">
            <button type="button" aria-label="Expand floating video" title="Expand video" onClick={openVideoPresentation} className="grid h-12 w-12 place-items-center text-white hover:bg-white/20"><FiMaximize2 /></button>
            <button type="button" aria-label="Close floating video" title="Close floating video" onClick={closePictureInPicture} className="grid h-12 w-12 place-items-center text-white hover:bg-white/20"><FiX /></button>
          </div>
        )}
        {playerError && pipFloat && (
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
      {playerError && (
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
      <PlayerDock
        track={video} playing={isPlaying} position={currentTime} duration={duration}
        disabled={isJamGuest} nextDisabled={jamLocked} shuffle={shuffle} repeat={repeat} repeatOne={repeatMode === "one"}
        onShuffle={toggleShuffle} onRepeat={() => setRepeatMode((value) => value === "off" ? "queue" : value === "queue" ? "one" : "off")}
        onPlayPause={handlePlayPause} onPrevious={handlePrev} onNext={() => handleNext()}
        onSeek={seekOnCurrentTrack} favourite={<FavouriteTrackButton track={video} className="!h-12 !w-12" />}
        qualityControl={<PlaybackQualityControl provider={getActivePlayer()?.provider} asset={mediaAsset} qualities={mediaQualities} selection={qualitySelection} disabled={isJamGuest} onChange={(selection) => {
          const player = getActivePlayer();
          if (!player || isJamGuest) return;
          setQualitySelection(selection);
          sourceSwitchRef.current = { occurrence: queueEntryIdentity(video), position: player.getCurrentTime(), playing: isPlayingRef.current, forceIframe: false };
          fallbackOccurrenceRef.current = null;
          setSourceRevision((value) => value + 1);
        }} />}
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
        pipLabel={videoVisible ? "Floating player unavailable while video is visible" : typeof window !== "undefined" && window.documentPictureInPicture?.requestWindow ? "Floating player controls" : "Floating player"}
        pipDisabled={pictureInPicture === false || videoVisible}
        videoAvailable={videoVisible}
        playbackClock={playbackClock}
        onLyrics={syncedLyrics !== false ? toggleLyrics : undefined}
      />
      {pipFloat && !videoVisible && <FloatingPlayer track={video} playing={isPlaying} disabled={isJamGuest} onPlayPause={handlePlayPause} onNext={() => handleNext()} onClose={closePictureInPicture} />}
      {pipWindow && pipMountRef.current && (
        <ClockedPictureInPictureWindow
          clock={playbackClock}
          container={pipMountRef.current}
          video={video}
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

export default React.memo(YouTubePlayer);
