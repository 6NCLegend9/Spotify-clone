import { useEffect, useRef, useState } from "react";
import { api, resolveApiUrl } from "../lib/api";

export const EQ_FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
export const EQ_PRESETS = {
  Flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  "Bass Boost": [7, 6, 5, 3, 1, 0, -1, -2, -3, -3],
  "Treble Boost": [-3, -3, -2, -1, 0, 1, 3, 5, 6, 7],
  Vocal: [-3, -2, -1, 1, 3, 5, 4, 2, 0, -1],
  Night: [-5, -4, -3, -2, 0, 1, 1, 0, -2, -4],
  Rock: [5, 4, 2, 0, -1, 1, 3, 4, 5, 4],
  Pop: [-1, 0, 2, 4, 4, 2, 0, 1, 2, 1],
  "Hip-Hop/Rap": [6, 5, 4, 2, 0, -1, 0, 1, 2, 1],
};

const QUALITY_MODES = new Set(["auto", "low", "medium", "high", "ultra"]);
const REPEAT_MODES = new Set(["off", "context", "one"]);
const CROSSFADE_DURATIONS = new Set([0, 2, 4, 6, 8]);

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function finiteNumber(value, fallback = 0) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

function readStored(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

function writeStored(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    return;
  }
}

function normaliseBands(value) {
  if (!Array.isArray(value) || value.length !== EQ_FREQUENCIES.length) return EQ_PRESETS.Flat;
  const bands = value.map((band) => Number(typeof band === "object" && band ? band.gainDb : band));
  return bands.every(Number.isFinite) ? bands.map((band) => clamp(band, -12, 12)) : EQ_PRESETS.Flat;
}

function initialEqualizer() {
  const stored = readStored("musicon:equalizer:v1", {});
  return {
    enabled: typeof stored.enabled === "boolean" ? stored.enabled : true,
    preset: typeof stored.preset === "string" ? stored.preset : "Flat",
    bands: normaliseBands(stored.bands),
  };
}

function inferNetworkQuality(dataSaver) {
  if (dataSaver) return "low";
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!connection) return "high";
  if (connection.effectiveType === "slow-2g" || connection.effectiveType === "2g") return "low";
  if (connection.effectiveType === "3g") return "medium";
  if (Number(connection.downlink) >= 20 && Number(connection.rtt) <= 80) return "ultra";
  return "high";
}

export function getAudioSourceCandidates(track, settings) {
  if (!track) return [];
  const requestedQuality = settings.qualityMode === "auto" ? settings.qualityEffective : settings.qualityMode;
  const qualities = [...new Set([requestedQuality, "ultra", "high", "medium", "low"])];
  const sources = qualities
    .map((quality) => ({ quality, url: resolveApiUrl(track.audioSources?.[quality]) }))
    .filter((source) => typeof source.url === "string" && source.url);

  const fallbackUrl = resolveApiUrl(track.audioUrl);
  if (typeof fallbackUrl === "string" && fallbackUrl && !sources.some((source) => source.url === fallbackUrl)) {
    sources.push({ quality: requestedQuality || "high", url: fallbackUrl });
  }
  return sources;
}

export function getEffectiveAudioUrl(track, settings) {
  return getAudioSourceCandidates(track, settings)[0]?.url || null;
}

function waitForPlayable(audio, sourceUrl) {
  const expectedSource = new URL(sourceUrl, window.location.href).href;
  const isExpectedSource = () => audio.currentSrc === expectedSource;
  const isPlayable = () => isExpectedSource() && audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA;
  if (isPlayable()) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => finish(reject, new Error("Audio source timed out")), 8000);
    const finish = (callback, value) => {
      window.clearTimeout(timeout);
      audio.removeEventListener("canplay", ready);
      audio.removeEventListener("error", failed);
      callback(value);
    };
    const ready = () => {
      if (isPlayable()) finish(resolve);
    };
    const failed = () => {
      if (isExpectedSource()) finish(reject, new Error("Audio source is unavailable"));
    };
    audio.addEventListener("canplay", ready, { once: true });
    audio.addEventListener("error", failed, { once: true });
  });
}

function normaliseQueue(track, contextQueue) {
  const queue = Array.isArray(contextQueue) ? contextQueue.filter((candidate) => candidate?.id) : [];
  return queue.length ? queue : [track];
}

export function useAudioPlayer({ serverSettings, onSettingsChange, onListeningEvent, notify }) {
  const primaryAudioRef = useRef(null);
  const secondaryAudioRef = useRef(null);
  const graphRef = useRef(null);
  const activeSlotRef = useRef(0);
  const slotGainsRef = useRef([1, 0]);
  const slotLoadingRef = useRef([false, false]);
  const transitionRef = useRef(null);
  const preloadRef = useRef(null);
  const loadRequestRef = useRef(0);
  const qualityCacheRef = useRef({ value: "high", expiresAt: 0 });
  const previousVolumeRef = useRef(0.8);
  const hydratedSettingsRef = useRef(false);
  const [track, setTrack] = useState(null);
  const [queue, setQueue] = useState([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [playbackContext, setPlaybackContext] = useState({ type: "queue" });
  const [isPlaying, setIsPlaying] = useState(false);
  const [progressSec, setProgressSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [volume, setVolumeState] = useState(() => clamp(Number(readStored("musicon:volume", 0.8)), 0, 1));
  const [muted, setMutedState] = useState(() => Boolean(readStored("musicon:muted", false)));
  const [shuffle, setShuffleState] = useState(() => Boolean(readStored("musicon:shuffle", false)));
  const [repeatMode, setRepeatModeState] = useState(() => REPEAT_MODES.has(readStored("musicon:repeat-mode", "off")) ? readStored("musicon:repeat-mode", "off") : "off");
  const [crossfadeSeconds, setCrossfadeSecondsState] = useState(() => CROSSFADE_DURATIONS.has(readStored("musicon:crossfade-seconds", 4)) ? readStored("musicon:crossfade-seconds", 4) : 4);
  const [equalizer, setEqualizerState] = useState(initialEqualizer);
  const equalizerRef = useRef(equalizer);
  const [qualityMode, setQualityModeState] = useState(() => QUALITY_MODES.has(readStored("musicon:quality-mode", "auto")) ? readStored("musicon:quality-mode", "auto") : "auto");
  const [qualityEffective, setQualityEffective] = useState(() => readStored("musicon:quality-effective", "high"));
  const [dataSaverEnabled, setDataSaverEnabledState] = useState(() => Boolean(readStored("musicon:data-saver", false)));
  const [normalizeVolume, setNormalizeVolumeState] = useState(() => Boolean(readStored("musicon:normalize-volume", false)));
  const [skipSilence, setSkipSilenceState] = useState(() => Boolean(readStored("musicon:skip-silence", false)));
  const [allowDownloads, setAllowDownloadsState] = useState(() => Boolean(readStored("musicon:allow-downloads", false)));
  const [keyboardShortcutsEnabled, setKeyboardShortcutsEnabledState] = useState(() => Boolean(readStored("musicon:keyboard-shortcuts", true)));
  const [videoMuted, setVideoMutedState] = useState(() => Boolean(readStored("musicon:video-muted", true)));
  const [equalizerSupported, setEqualizerSupported] = useState(true);
  const [audioError, setAudioError] = useState("");
  const stateRef = useRef({ track: null, queue: [], queueIndex: -1, playbackContext: { type: "queue" }, isPlaying: false, volume: 0.8, muted: false, shuffle: false, repeatMode: "off", crossfadeSeconds: 4, qualityMode: "auto", qualityEffective: "high", dataSaverEnabled: false, normalizeVolume: false });

  useEffect(() => {
    stateRef.current = { ...stateRef.current, track, queue, queueIndex, playbackContext, isPlaying, volume, muted, shuffle, repeatMode, crossfadeSeconds, qualityMode, qualityEffective, dataSaverEnabled, normalizeVolume };
  }, [track, queue, queueIndex, playbackContext, isPlaying, volume, muted, shuffle, repeatMode, crossfadeSeconds, qualityMode, qualityEffective, dataSaverEnabled, normalizeVolume]);

  useEffect(() => {
    if (hydratedSettingsRef.current || !serverSettings) return;
    hydratedSettingsRef.current = true;
    const serverEqualizer = serverSettings.equalizer || {};
    const bands = normaliseBands(serverEqualizer.bands || serverSettings.eqBands);
    const nextEqualizer = {
      enabled: typeof serverEqualizer.enabled === "boolean" ? serverEqualizer.enabled : equalizerRef.current.enabled,
      preset: typeof serverEqualizer.preset === "string" ? serverEqualizer.preset : serverSettings.eqPreset || equalizerRef.current.preset,
      bands,
    };
    equalizerRef.current = nextEqualizer;
    setEqualizerState(nextEqualizer);
    if (Number.isFinite(serverSettings.volume)) setVolumeState(clamp(serverSettings.volume, 0, 1));
    if (typeof serverSettings.muted === "boolean") setMutedState(serverSettings.muted);
    if (typeof serverSettings.shuffle === "boolean") setShuffleState(serverSettings.shuffle);
    if (REPEAT_MODES.has(serverSettings.repeatMode)) setRepeatModeState(serverSettings.repeatMode);
    if (CROSSFADE_DURATIONS.has(serverSettings.crossfadeSeconds)) setCrossfadeSecondsState(serverSettings.crossfadeSeconds);
    if (QUALITY_MODES.has(serverSettings.qualityMode)) setQualityModeState(serverSettings.qualityMode);
    if (QUALITY_MODES.has(serverSettings.qualityEffective)) setQualityEffective(serverSettings.qualityEffective);
    if (typeof serverSettings.dataSaverEnabled === "boolean") setDataSaverEnabledState(serverSettings.dataSaverEnabled);
    if (typeof serverSettings.normalizeVolume === "boolean") setNormalizeVolumeState(serverSettings.normalizeVolume);
    if (typeof serverSettings.skipSilence === "boolean") setSkipSilenceState(serverSettings.skipSilence);
    if (typeof serverSettings.allowDownloads === "boolean") setAllowDownloadsState(serverSettings.allowDownloads);
    if (typeof serverSettings.keyboardShortcutsEnabled === "boolean") setKeyboardShortcutsEnabledState(serverSettings.keyboardShortcutsEnabled);
  }, [serverSettings]);

  useEffect(() => writeStored("musicon:volume", volume), [volume]);
  useEffect(() => writeStored("musicon:muted", muted), [muted]);
  useEffect(() => writeStored("musicon:shuffle", shuffle), [shuffle]);
  useEffect(() => writeStored("musicon:repeat-mode", repeatMode), [repeatMode]);
  useEffect(() => writeStored("musicon:crossfade-seconds", crossfadeSeconds), [crossfadeSeconds]);
  useEffect(() => writeStored("musicon:equalizer:v1", equalizer), [equalizer]);
  useEffect(() => writeStored("musicon:quality-mode", qualityMode), [qualityMode]);
  useEffect(() => writeStored("musicon:quality-effective", qualityEffective), [qualityEffective]);
  useEffect(() => writeStored("musicon:data-saver", dataSaverEnabled), [dataSaverEnabled]);
  useEffect(() => writeStored("musicon:normalize-volume", normalizeVolume), [normalizeVolume]);
  useEffect(() => writeStored("musicon:skip-silence", skipSilence), [skipSilence]);
  useEffect(() => writeStored("musicon:allow-downloads", allowDownloads), [allowDownloads]);
  useEffect(() => writeStored("musicon:keyboard-shortcuts", keyboardShortcutsEnabled), [keyboardShortcutsEnabled]);
  useEffect(() => writeStored("musicon:video-muted", videoMuted), [videoMuted]);
  useEffect(() => {
    if (track?.id) writeStored("musicon:last-track-id", track.id);
  }, [track]);
  useEffect(() => writeStored("musicon:last-position-sec", progressSec), [progressSec]);

  function audioForSlot(slot) {
    return slot === 0 ? primaryAudioRef.current : secondaryAudioRef.current;
  }

  function applySlotVolumes() {
    const graph = graphRef.current;
    const state = stateRef.current;
    const baseVolume = state.muted ? 0 : graph ? 1 : finiteNumber(state.volume, 0.8);
    [0, 1].forEach((slot) => {
      const audio = audioForSlot(slot);
      const fallbackGain = slot === activeSlotRef.current ? 1 : 0;
      const slotGain = finiteNumber(slotGainsRef.current[slot], fallbackGain);
      if (audio) audio.volume = clamp(baseVolume * slotGain, 0, 1);
    });
  }

  function applyAudioProcessing() {
    const graph = graphRef.current;
    if (graph) {
      graph.filters.forEach((filter, index) => {
        filter.gain.value = equalizerRef.current.enabled ? clamp(equalizerRef.current.bands[index], -12, 12) : 0;
      });
      graph.masterGain.gain.value = stateRef.current.muted ? 0 : stateRef.current.volume * (stateRef.current.normalizeVolume ? 0.85 : 1);
    }
    applySlotVolumes();
  }

  async function ensureAudioGraph() {
    if (graphRef.current) {
      if (graphRef.current.context.state === "suspended") await graphRef.current.context.resume();
      applyAudioProcessing();
      return true;
    }
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    const primary = primaryAudioRef.current;
    const secondary = secondaryAudioRef.current;
    if (!AudioContextConstructor || !primary || !secondary) {
      setEqualizerSupported(false);
      applySlotVolumes();
      return false;
    }

    try {
      const context = new AudioContextConstructor();
      const filters = EQ_FREQUENCIES.map((frequency) => {
        const filter = context.createBiquadFilter();
        filter.type = "peaking";
        filter.frequency.value = frequency;
        filter.Q.value = 1.1;
        return filter;
      });
      const masterGain = context.createGain();
      const primarySource = context.createMediaElementSource(primary);
      const secondarySource = context.createMediaElementSource(secondary);
      primarySource.connect(filters[0]);
      secondarySource.connect(filters[0]);
      filters.forEach((filter, index) => {
        if (index < filters.length - 1) filter.connect(filters[index + 1]);
      });
      filters.at(-1).connect(masterGain);
      masterGain.connect(context.destination);
      graphRef.current = { context, filters, masterGain, primarySource, secondarySource };
      setEqualizerSupported(true);
      await context.resume();
      applyAudioProcessing();
      return true;
    } catch {
      setEqualizerSupported(false);
      applySlotVolumes();
      return false;
    }
  }

  function resolveQuality() {
    const state = stateRef.current;
    if (state.qualityMode !== "auto") {
      if (state.qualityEffective !== state.qualityMode) setQualityEffective(state.qualityMode);
      return state.qualityMode;
    }
    const now = Date.now();
    if (qualityCacheRef.current.expiresAt <= now) {
      qualityCacheRef.current = { value: inferNetworkQuality(state.dataSaverEnabled), expiresAt: now + 300000 };
    }
    if (state.qualityEffective !== qualityCacheRef.current.value) setQualityEffective(qualityCacheRef.current.value);
    return qualityCacheRef.current.value;
  }

  function sourceCandidates(trackToPlay) {
    return getAudioSourceCandidates(trackToPlay, { ...stateRef.current, qualityEffective: resolveQuality() });
  }

  async function loadSlot(slot, nextTrack, startSec = 0, shouldPlay = false) {
    const audio = audioForSlot(slot);
    if (!audio) throw new Error("Audio player is unavailable");
    const candidates = sourceCandidates(nextTrack);
    if (!candidates.length) throw new Error("No licensed audio source is available for this track");
    let lastError = null;
    slotLoadingRef.current[slot] = true;

    try {
      for (const source of candidates) {
        try {
          audio.pause();
          audio.src = source.url;
          audio.load();
          await waitForPlayable(audio, source.url);
          if (Number.isFinite(startSec) && startSec > 0) {
            try {
              audio.currentTime = Math.min(startSec, Number.isFinite(audio.duration) ? Math.max(0, audio.duration - 0.05) : startSec);
            } catch {
              audio.currentTime = 0;
            }
          }
          if (shouldPlay) {
            await ensureAudioGraph();
            await audio.play();
          }
          if (source.quality && source.quality !== stateRef.current.qualityEffective) setQualityEffective(source.quality);
          return source;
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError || new Error("No playable audio source is available");
    } finally {
      slotLoadingRef.current[slot] = false;
    }
  }

  function clearSlot(slot) {
    const audio = audioForSlot(slot);
    if (!audio) return;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }

  function setCurrentPlayback(nextTrack, nextQueue, nextIndex, nextContext) {
    const state = stateRef.current;
    stateRef.current = { ...state, track: nextTrack, queue: nextQueue, queueIndex: nextIndex, playbackContext: nextContext };
    setTrack(nextTrack);
    setQueue(nextQueue);
    setQueueIndex(nextIndex);
    setPlaybackContext(nextContext);
  }

  function setPlayingState(nextValue) {
    stateRef.current = { ...stateRef.current, isPlaying: nextValue };
    setIsPlaying(nextValue);
  }

  function getNextIndex(state, automatic = false) {
    if (!state.queue.length) return null;
    if (automatic && state.repeatMode === "one") return state.queueIndex;
    if (state.shuffle && state.queue.length > 1) {
      const options = state.queue.map((_, index) => index).filter((index) => index !== state.queueIndex);
      return options[Math.floor(Math.random() * options.length)];
    }
    if (state.queueIndex + 1 < state.queue.length) return state.queueIndex + 1;
    return state.repeatMode === "context" ? 0 : null;
  }

  function getPreviousIndex(state) {
    if (!state.queue.length) return null;
    if (state.shuffle && state.queue.length > 1) {
      const options = state.queue.map((_, index) => index).filter((index) => index !== state.queueIndex);
      return options[Math.floor(Math.random() * options.length)];
    }
    if (state.queueIndex > 0) return state.queueIndex - 1;
    return state.repeatMode === "context" ? state.queue.length - 1 : 0;
  }

  function recordListening(trackToRecord, context) {
    api.post("/api/listening-events", {
      trackId: trackToRecord.id,
      context: { type: context?.type || "queue", ...(context?.refId ? { refId: context.refId } : {}) },
      positionSecAtStart: 0,
    }).then(() => onListeningEvent?.()).catch(() => undefined);
  }

  function preloadNext(nextQueue = stateRef.current.queue, nextIndex = stateRef.current.queueIndex) {
    const state = stateRef.current;
    if (!state.crossfadeSeconds) return;
    const previewState = { ...state, queue: nextQueue, queueIndex: nextIndex };
    const followingIndex = getNextIndex(previewState);
    if (followingIndex === null) return;
    const nextTrack = nextQueue[followingIndex];
    const incomingSlot = 1 - activeSlotRef.current;
    const incomingAudio = audioForSlot(incomingSlot);
    if (!incomingAudio || preloadRef.current?.trackId === nextTrack.id && preloadRef.current.slot === incomingSlot) return;
    const source = sourceCandidates(nextTrack)[0];
    if (!source) return;
    incomingAudio.pause();
    incomingAudio.src = source.url;
    incomingAudio.load();
    preloadRef.current = { trackId: nextTrack.id, slot: incomingSlot };
  }

  function settleTransition() {
    const transition = transitionRef.current;
    if (!transition) return;
    window.cancelAnimationFrame(transition.frame);
    if (transition.pending) {
      clearSlot(transition.incomingSlot);
      slotGainsRef.current = transition.outgoingSlot === 0 ? [1, 0] : [0, 1];
      transitionRef.current = null;
      preloadRef.current = null;
      applyAudioProcessing();
      return;
    }
    clearSlot(transition.outgoingSlot);
    activeSlotRef.current = transition.incomingSlot;
    slotGainsRef.current = transition.incomingSlot === 0 ? [1, 0] : [0, 1];
    transitionRef.current = null;
    preloadRef.current = null;
    applyAudioProcessing();
  }

  async function startTrack(nextTrack, { nextQueue, nextIndex, context, startSec = 0, record = true } = {}) {
    if (!nextTrack?.id) return;
    const requestId = ++loadRequestRef.current;
    settleTransition();
    const activeSlot = activeSlotRef.current;
    const inactiveSlot = 1 - activeSlot;
    clearSlot(inactiveSlot);
    clearSlot(activeSlot);
    slotGainsRef.current = activeSlot === 0 ? [1, 0] : [0, 1];
    preloadRef.current = null;
    const resolvedQueue = normaliseQueue(nextTrack, nextQueue);
    const resolvedIndex = Number.isInteger(nextIndex) && nextIndex >= 0 ? nextIndex : Math.max(0, resolvedQueue.findIndex((candidate) => candidate.id === nextTrack.id));
    const resolvedContext = context || { type: "queue" };
    setCurrentPlayback(nextTrack, resolvedQueue, resolvedIndex, resolvedContext);
    setProgressSec(startSec);
    setDurationSec(Number(nextTrack.durationSec) || 0);
    setAudioError("");
    applyAudioProcessing();

    try {
      await loadSlot(activeSlot, nextTrack, startSec, true);
      if (requestId !== loadRequestRef.current) return;
      activeSlotRef.current = activeSlot;
      setPlayingState(true);
      const activeAudio = audioForSlot(activeSlot);
      if (Number.isFinite(activeAudio?.duration)) setDurationSec(activeAudio.duration);
      if (record) recordListening(nextTrack, resolvedContext);
      preloadNext(resolvedQueue, resolvedIndex);
    } catch (error) {
      if (requestId !== loadRequestRef.current) return;
      setPlayingState(false);
      const message = error?.message || "This audio source could not be played";
      setAudioError(message);
      notify?.(message, "error");
    }
  }

  async function beginCrossfade() {
    const state = stateRef.current;
    if (transitionRef.current || !state.isPlaying || !state.crossfadeSeconds) return;
    const followingIndex = getNextIndex(state, true);
    if (followingIndex === null || followingIndex === state.queueIndex && state.repeatMode !== "one") return;
    const nextTrack = state.queue[followingIndex];
    const outgoingSlot = activeSlotRef.current;
    const incomingSlot = 1 - outgoingSlot;
    const incomingAudio = audioForSlot(incomingSlot);
    if (!incomingAudio) return;
    const transition = { outgoingSlot, incomingSlot, frame: 0, pending: true };
    transitionRef.current = transition;

    try {
      if (preloadRef.current?.trackId !== nextTrack.id || preloadRef.current.slot !== incomingSlot || incomingAudio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
        await loadSlot(incomingSlot, nextTrack, 0, false);
      }
      incomingAudio.currentTime = 0;
      slotGainsRef.current = outgoingSlot === 0 ? [1, 0] : [0, 1];
      applyAudioProcessing();
      await ensureAudioGraph();
      if (transitionRef.current !== transition) return;
      await incomingAudio.play();
    } catch {
      if (transitionRef.current !== transition) return;
      transitionRef.current = null;
      next({ automatic: true });
      return;
    }
    if (transitionRef.current !== transition) {
      incomingAudio.pause();
      return;
    }

    const outgoingAudio = audioForSlot(outgoingSlot);
    const requestedDuration = finiteNumber(state.crossfadeSeconds);
    const outgoingDuration = finiteNumber(outgoingAudio?.duration, finiteNumber(state.durationSec));
    const duration = Math.min(requestedDuration, Math.max(0.1, outgoingDuration - 0.05));
    if (!Number.isFinite(duration) || duration <= 0) {
      next({ automatic: true });
      return;
    }
    activeSlotRef.current = incomingSlot;
    setCurrentPlayback(nextTrack, state.queue, followingIndex, state.playbackContext);
    setProgressSec(0);
    setDurationSec(Number.isFinite(incomingAudio.duration) ? incomingAudio.duration : Number(nextTrack.durationSec) || 0);
    recordListening(nextTrack, state.playbackContext);
    transition.pending = false;
    preloadRef.current = null;
    const startTime = performance.now();

    const animate = (now) => {
      const progress = clamp((now - startTime) / (duration * 1000), 0, 1);
      slotGainsRef.current[outgoingSlot] = Math.cos((progress * Math.PI) / 2);
      slotGainsRef.current[incomingSlot] = Math.sin((progress * Math.PI) / 2);
      applyAudioProcessing();
      if (progress < 1) {
        transition.frame = window.requestAnimationFrame(animate);
        return;
      }
      clearSlot(outgoingSlot);
      slotGainsRef.current[incomingSlot] = 1;
      slotGainsRef.current[outgoingSlot] = 0;
      transitionRef.current = null;
      applyAudioProcessing();
      preloadNext(state.queue, followingIndex);
    };
    transition.frame = window.requestAnimationFrame(animate);
  }

  function play(nextTrack, contextQueue, startIndex, context) {
    const state = stateRef.current;
    if (!nextTrack?.id) return;
    if (nextTrack.provider === "spotify" && nextTrack.spotifyId) {
      closePlayer();
      window.location.hash = `/track/${encodeURIComponent(nextTrack.id)}?panel=video&autoplay=1`;
      return;
    }
    if (state.track?.id === nextTrack.id && !contextQueue?.length) {
      const activeAudio = audioForSlot(activeSlotRef.current);
      ensureAudioGraph().then(() => activeAudio?.play()).then(() => setPlayingState(true)).catch(() => undefined);
      return;
    }
    const nextQueue = normaliseQueue(nextTrack, contextQueue);
    const nextIndex = Number.isInteger(startIndex) ? startIndex : Math.max(0, nextQueue.findIndex((candidate) => candidate.id === nextTrack.id));
    startTrack(nextTrack, { nextQueue, nextIndex, context });
  }

  function pause() {
    settleTransition();
    audioForSlot(activeSlotRef.current)?.pause();
    setPlayingState(false);
  }

  function seek(seconds) {
    settleTransition();
    const audio = audioForSlot(activeSlotRef.current);
    if (!audio || !Number.isFinite(seconds)) return;
    const target = clamp(seconds, 0, Number.isFinite(audio.duration) ? audio.duration : Math.max(seconds, 0));
    try {
      audio.currentTime = target;
      setProgressSec(target);
    } catch {
      return;
    }
  }

  function next({ automatic = false } = {}) {
    settleTransition();
    const state = stateRef.current;
    const followingIndex = getNextIndex(state, automatic);
    if (followingIndex === null) {
      pause();
      return;
    }
    startTrack(state.queue[followingIndex], { nextQueue: state.queue, nextIndex: followingIndex, context: state.playbackContext, record: !(automatic && followingIndex === state.queueIndex) });
  }

  function previous() {
    settleTransition();
    const activeAudio = audioForSlot(activeSlotRef.current);
    if (activeAudio?.currentTime > 3) {
      seek(0);
      return;
    }
    const state = stateRef.current;
    const previousIndex = getPreviousIndex(state);
    if (previousIndex === null) return;
    startTrack(state.queue[previousIndex], { nextQueue: state.queue, nextIndex: previousIndex, context: state.playbackContext });
  }

  function addToQueue(trackToAdd) {
    if (!trackToAdd?.id) return;
    const state = stateRef.current;
    const nextQueue = [...state.queue, trackToAdd];
    stateRef.current = { ...state, queue: nextQueue };
    setQueue(nextQueue);
  }

  function playNext(trackToAdd) {
    if (!trackToAdd?.id) return;
    const state = stateRef.current;
    const insertionIndex = Math.max(0, state.queueIndex + 1);
    const nextQueue = [...state.queue];
    nextQueue.splice(insertionIndex, 0, trackToAdd);
    stateRef.current = { ...state, queue: nextQueue };
    setQueue(nextQueue);
  }

  function removeFromQueue(index) {
    const state = stateRef.current;
    if (!Number.isInteger(index) || index < 0 || index >= state.queue.length || index === state.queueIndex) return;
    const nextQueue = state.queue.filter((_, queueItemIndex) => queueItemIndex !== index);
    const nextIndex = index < state.queueIndex ? state.queueIndex - 1 : state.queueIndex;
    stateRef.current = { ...state, queue: nextQueue, queueIndex: nextIndex };
    setQueue(nextQueue);
    setQueueIndex(nextIndex);
  }

  function clearQueue() {
    const state = stateRef.current;
    const nextQueue = state.track ? [state.track] : [];
    stateRef.current = { ...state, queue: nextQueue, queueIndex: state.track ? 0 : -1 };
    setQueue(nextQueue);
    setQueueIndex(state.track ? 0 : -1);
  }

  function closePlayer() {
    ++loadRequestRef.current;
    settleTransition();
    clearSlot(0);
    clearSlot(1);
    slotGainsRef.current = [1, 0];
    preloadRef.current = null;
    stateRef.current = { ...stateRef.current, track: null, queue: [], queueIndex: -1, isPlaying: false };
    setTrack(null);
    setQueue([]);
    setQueueIndex(-1);
    setProgressSec(0);
    setDurationSec(0);
    setPlayingState(false);
  }

  function setVolume(nextVolume) {
    const normalised = clamp(Number(nextVolume), 0, 1);
    if (normalised > 0) previousVolumeRef.current = normalised;
    setVolumeState(normalised);
    if (normalised > 0 && muted) setMutedState(false);
    onSettingsChange?.({ volume: normalised, ...(normalised > 0 && muted ? { muted: false } : {}) });
  }

  function toggleMuted() {
    if (muted || volume === 0) {
      const restored = previousVolumeRef.current || 0.8;
      setMutedState(false);
      setVolumeState(restored);
      onSettingsChange?.({ muted: false, volume: restored });
      return;
    }
    previousVolumeRef.current = volume;
    setMutedState(true);
    onSettingsChange?.({ muted: true });
  }

  function setShuffle(nextShuffle) {
    const value = Boolean(nextShuffle);
    setShuffleState(value);
    onSettingsChange?.({ shuffle: value });
  }

  function setRepeatMode(nextMode) {
    if (!REPEAT_MODES.has(nextMode)) return;
    settleTransition();
    setRepeatModeState(nextMode);
    onSettingsChange?.({ repeatMode: nextMode });
  }

  function setCrossfadeSeconds(nextDuration) {
    const value = Number(nextDuration);
    if (!CROSSFADE_DURATIONS.has(value)) return;
    settleTransition();
    setCrossfadeSecondsState(value);
    onSettingsChange?.({ crossfadeSeconds: value });
  }

  function updateEqualizer(patch) {
    const current = equalizerRef.current;
    const bands = Object.hasOwn(patch, "bands") ? normaliseBands(patch.bands) : current.bands;
    const preset = typeof patch.preset === "string" ? patch.preset : current.preset;
    const nextEqualizer = { enabled: typeof patch.enabled === "boolean" ? patch.enabled : current.enabled, preset, bands };
    equalizerRef.current = nextEqualizer;
    setEqualizerState(nextEqualizer);
    onSettingsChange?.({
      equalizer: { enabled: nextEqualizer.enabled, preset: nextEqualizer.preset, bands: nextEqualizer.bands },
      eqBands: nextEqualizer.bands,
      eqPreset: nextEqualizer.preset,
    });
  }

  function setQualityMode(nextMode) {
    if (!QUALITY_MODES.has(nextMode)) return;
    setQualityModeState(nextMode);
    onSettingsChange?.({ qualityMode: nextMode });
  }

  function setDataSaverEnabled(value) {
    const nextValue = Boolean(value);
    qualityCacheRef.current.expiresAt = 0;
    setDataSaverEnabledState(nextValue);
    onSettingsChange?.({ dataSaverEnabled: nextValue });
  }

  function setNormalizeVolume(value) {
    const nextValue = Boolean(value);
    setNormalizeVolumeState(nextValue);
    onSettingsChange?.({ normalizeVolume: nextValue });
  }

  function setSkipSilence(value) {
    const nextValue = Boolean(value);
    setSkipSilenceState(nextValue);
    onSettingsChange?.({ skipSilence: nextValue });
  }

  function setAllowDownloads(value) {
    const nextValue = Boolean(value);
    setAllowDownloadsState(nextValue);
    onSettingsChange?.({ allowDownloads: nextValue });
  }

  function setKeyboardShortcutsEnabled(value) {
    const nextValue = Boolean(value);
    setKeyboardShortcutsEnabledState(nextValue);
    onSettingsChange?.({ keyboardShortcutsEnabled: nextValue });
  }

  function setVideoMuted(value) {
    setVideoMutedState(Boolean(value));
  }

  function handleTimeUpdate(slot) {
    if (slot !== activeSlotRef.current) return;
    const audio = audioForSlot(slot);
    if (!audio) return;
    setProgressSec(audio.currentTime || 0);
    if (Number.isFinite(audio.duration)) setDurationSec(audio.duration);
    const state = stateRef.current;
    const effectiveFade = Math.min(state.crossfadeSeconds, Math.max(0, (audio.duration || state.durationSec) - 0.05));
    if (!transitionRef.current && state.isPlaying && effectiveFade > 0 && (audio.duration - audio.currentTime) <= effectiveFade) beginCrossfade();
  }

  function handleLoadedMetadata(slot) {
    if (slot !== activeSlotRef.current) return;
    const audio = audioForSlot(slot);
    if (Number.isFinite(audio?.duration)) setDurationSec(audio.duration);
  }

  function handleEnded(slot) {
    if (slot !== activeSlotRef.current || transitionRef.current) return;
    next({ automatic: true });
  }

  function handleAudioError(slot) {
    if (slot !== activeSlotRef.current || slotLoadingRef.current[slot]) return;
    const message = "Playback hit an unavailable audio source.";
    setAudioError(message);
    setPlayingState(false);
    notify?.(message, "error");
  }

  useEffect(() => {
    applyAudioProcessing();
  }, [volume, muted, equalizer, normalizeVolume]);

  useEffect(() => {
    if (!track || !isPlaying) return;
    const activeAudio = audioForSlot(activeSlotRef.current);
    const position = activeAudio?.currentTime || 0;
    startTrack(track, { nextQueue: queue, nextIndex: queueIndex, context: playbackContext, startSec: position, record: false });
  }, [qualityMode]);

  useEffect(() => {
    return () => {
      const transition = transitionRef.current;
      if (transition) window.cancelAnimationFrame(transition.frame);
      [primaryAudioRef.current, secondaryAudioRef.current].forEach((audio) => audio?.pause());
      const graph = graphRef.current;
      if (!graph) return;
      graph.primarySource.disconnect();
      graph.secondarySource.disconnect();
      graph.filters.forEach((filter) => filter.disconnect());
      graph.masterGain.disconnect();
      if (graph.context.state !== "closed") graph.context.close();
    };
  }, []);

  return {
    primaryAudioRef,
    secondaryAudioRef,
    track,
    queue,
    queueIndex,
    playbackContext,
    isPlaying,
    progressSec,
    durationSec,
    volume,
    muted,
    shuffle,
    repeatMode,
    crossfadeSeconds,
    equalizer,
    qualityMode,
    qualityEffective,
    dataSaverEnabled,
    normalizeVolume,
    skipSilence,
    allowDownloads,
    keyboardShortcutsEnabled,
    videoMuted,
    equalizerSupported,
    audioError,
    play,
    pause,
    seek,
    next,
    previous,
    addToQueue,
    playNext,
    removeFromQueue,
    clearQueue,
    closePlayer,
    setVolume,
    toggleMuted,
    setShuffle,
    setRepeatMode,
    setCrossfadeSeconds,
    updateEqualizer,
    setQualityMode,
    setDataSaverEnabled,
    setNormalizeVolume,
    setSkipSilence,
    setAllowDownloads,
    setKeyboardShortcutsEnabled,
    setVideoMuted,
    handleTimeUpdate,
    handleLoadedMetadata,
    handleEnded,
    handleAudioError,
  };
}