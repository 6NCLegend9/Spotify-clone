import { MEDIA_PLAYER_STATES as STATES } from "./mediaPlayerStates.mjs";
import { resolveMediaAsset, cancelMediaReceipt } from "./resolveMediaAsset.mjs";
import { createNativeAudioGraph } from "./nativeAudioGraph.mjs";
import { createAndroidAudioElement } from "./androidAudioElement.mjs";
import { requestNativePlaybackGrant, revokeNativePlaybackGrant } from "../../../utils/nativePlaybackAuthorization.mjs";

export function createNativeMediaDeck({ host, videoId, mode, maxHeight, profile, autoplay = true, startSeconds = 0, title = "", events = {}, onAsset, onFallback, audioSettings, repeatOne = false }) {
  const media = (mode === "audio" ? createAndroidAudioElement(title) : null)
    || document.createElement(mode === "video" ? "video" : "audio");
  media.crossOrigin = "anonymous";
  media.preload = "auto";
  media.playsInline = true;
  media.setAttribute("playsinline", "");
  media.setAttribute("aria-label", title || "Music playback");
  media.title = title;
  media.style.cssText = "width:100%;height:100%;object-fit:contain";
  media.muted = true;
  host.replaceChildren(media);
  let id = videoId, state = STATES.UNSTARTED, intent = autoplay, position = startSeconds;
  let playAttempt = 0;
  let generation = 0, controller, receipt, asset, ready = false, destroyed = false, refreshed = false, renewTimer, graph, announcedReady = false;
  let nativeOccurrenceId, queueConfiguration, queueKey = "", queueGeneration = 0, queueController, queueHandoff = false;
  const queueGrants = new Set();
  const retireQueue = () => {
    nativeOccurrenceId = null;
    queueGeneration++; queueController?.abort(); queueHandoff = false; queueKey = "";
    for (const grant of queueGrants) void revokeNativePlaybackGrant(grant);
    queueGrants.clear();
  };
  const handoffQueue = async () => {
    if (destroyed || !ready || !asset || !queueConfiguration || queueHandoff
      || media.nativeQueueCapability !== "source-queue-v1") return;
    const key = JSON.stringify(queueConfiguration);
    if (key === queueKey) return;
    const own = queueGeneration, ownSource = generation;
    const expectedRevision = media.nativeQueueRevision;
    queueHandoff = true;
    queueController?.abort(); queueController = new AbortController();
    try {
      const grant = await requestNativePlaybackGrant({
        receipt: expectedRevision === 0 ? receipt : undefined,
        videoIds: [...new Set(queueConfiguration.entries.map(entry => entry.videoId))], profile,
        signal: queueController.signal, transportVersion: media.nativeTransportVersion,
        nativeQueue: media.nativeQueueCapability,
      });
      if (destroyed || own !== queueGeneration || ownSource !== generation || key !== JSON.stringify(queueConfiguration)) {
        void revokeNativePlaybackGrant(grant.nativeGrant); return;
      }
      const currentOccurrenceId = media.nativeQueueSnapshot?.currentOccurrenceId || queueConfiguration.currentOccurrenceId;
      const accepted = media.configureNativeQueue({
        ...queueConfiguration, currentOccurrenceId, revision: expectedRevision + 1, expectedRevision,
        nativeGrant: grant.nativeGrant, grantExpiresAt: grant.expiresAt, profile,
        ...(expectedRevision === 0 ? { receipt, assetExpiresAt: asset.expiresAt } : {}),
      });
      if (!accepted) { void revokeNativePlaybackGrant(grant.nativeGrant); return; }
      queueGrants.add(grant.nativeGrant); queueKey = key;
    } catch (error) {
      if (!destroyed && own === queueGeneration && error?.name !== "AbortError") emit("onQueueError", { reason: "native_authorization_unavailable" });
    } finally {
      if (own === queueGeneration) {
        queueHandoff = false;
        // A playlist edit during the grant request supersedes that handoff.
        // Send the latest configuration once the in-flight request settles.
        if (!destroyed && queueConfiguration && key !== JSON.stringify(queueConfiguration)) void handoffQueue();
      }
    }
  };
  const configureAndroidAudio = (settings, defer = false) => media.configureNativeAudio?.({
    bands: Array.from({ length: 6 }, (_, i) => Math.min(12, Math.max(-12, Number(settings?.bands?.[i]) || 0))),
    mono: settings?.monoAudio === true,
    bypass: false,
    normalizeLoudness: settings?.normalizeLoudness === true,
    loudness: asset?.loudness || null,
  }, { defer });
  configureAndroidAudio(audioSettings);
  media.setNativeRepeatOne?.(repeatOne);
  const emit = (name, data) => { if (!destroyed) events[name]?.({ target: deck, data }); };
  const setState = (next) => { state = next; emit("onStateChange", next); };
  const releaseSource = () => {
    // Release is lifecycle cleanup, not a new user Pause in the ordered protocol.
    if (!media.orderedTransport) media.pause();
    media.removeAttribute("src"); media.load();
  };
  const fallback = (reason) => {
    if (destroyed) return;
    const snapshot = { position: ready ? media.currentTime : position, playing: intent, reason };
    clearSource();
    onFallback?.(snapshot);
  };
  const listeners = new Map();
  const listen = (name, callback) => { listeners.set(name, callback); media.addEventListener(name, callback); };
  const resume = () => {
    if (!ready || destroyed || !intent) return;
    const attempt = ++playAttempt;
    const ownGeneration = generation;
    const fail = (error) => {
      if (destroyed || !intent || attempt !== playAttempt || ownGeneration !== generation || error?.name === "AbortError") return;
      // The decoder may still be playing. A control-channel failure must not
      // release it, retry its source, or fall back to another provider.
      if (error?.nativeTransport) return;
      if (error?.name === "NotAllowedError") {
        intent = false;
        if (!media.orderedTransport) media.pause();
        emit("onAutoplayBlocked");
      } else fallback("native_playback_failed");
    };
    try {
      try { if (!media.isAndroidNativeMedia) graph ||= createNativeAudioGraph(media, audioSettings); } catch { /* Native output remains available. */ }
      const context = graph?.resume();
      // The executor calls play synchronously, preserving user activation,
      // while also capturing throws before observing both resume promises.
      const playback = new Promise((resolve) => resolve(media.play()));
      Promise.all([context, playback]).catch(fail);
    } catch (error) { fail(error); }
  };
  async function resolve(renew = false) {
    const own = ++generation;
    controller?.abort();
    clearTimeout(renewTimer);
    controller = new AbortController();
    ready = false;
    asset = null;
    setState(STATES.BUFFERING);
    try {
      const result = await resolveMediaAsset({ videoId: id, mode, maxHeight, profile }, { signal: controller.signal, receipt: renew ? receipt : undefined, onPending: (pending) => { if (own === generation) receipt = pending.receipt; } });
      if (destroyed || own !== generation) { cancelMediaReceipt(result.receipt); return; }
      receipt = result.receipt;
      asset = result.asset;
      // Cache the new track's measurement without changing the previous native source.
      configureAndroidAudio(audioSettings, true);
      onAsset?.(result);
      media.src = asset.url;
      media.load();
      clearTimeout(renewTimer);
      renewTimer = setTimeout(() => {
        if (destroyed || own !== generation) return;
        if (ready) position = media.currentTime;
        if (!media.orderedTransport) media.pause();
        refreshed = true;
        void resolve(true);
      }, Math.min(2_147_483_647, Math.max(1000, asset.expiresAt - Date.now() - 60_000)));
      void handoffQueue();
    } catch (error) {
      if (!destroyed && own === generation && !controller.signal.aborted) fallback(error.message || "resolution_failed");
    }
  }
  const clearSource = () => {
    generation++; playAttempt++; controller?.abort(); clearTimeout(renewTimer);
    retireQueue();
    ready = false; asset = null;
    releaseSource();
    cancelMediaReceipt(receipt); receipt = null;
  };
  const updateTitle = (value, nextId) => {
    if (typeof value?.title === "string") title = value.title;
    else if (nextId !== id) title = "";
    media.title = title;
    media.setAttribute("aria-label", title || "Music playback");
  };
  listen("loadedmetadata", () => {
    if (destroyed || !asset || media.currentSrc !== asset.url) return;
    ready = true;
    const restored = media.nativeTransportRestored;
    if (restored) intent = media.nativePlayIntent;
    const duration = deck.getDuration();
    if (!restored) media.currentTime = Math.max(0, Math.min(position, Math.max(0, duration - .1)));
    if (!announcedReady) { announcedReady = true; emit("onReady"); }
    if (restored) setState(media.nativeObservedPlaying ? STATES.PLAYING : intent ? STATES.BUFFERING : STATES.PAUSED);
    else if (intent) resume(); else setState(STATES.CUED);
    void handoffQueue();
  });
  listen("transportintent", () => {
    // Ignore only the initial, empty baseline. Native controls during source
    // renewal and a recovered binding remain authoritative while not ready.
    if (!ready && !media.nativeTransportRestored && media.nativeIntentOrigin === "baseline") return;
    intent = media.nativePlayIntent;
    emit("onTransportIntent", { playing: intent, origin: media.nativeIntentOrigin });
  });
  listen("transporterror", () => emit("onTransportError", media.nativeTransportError));
  listen("transportrecovered", () => emit("onTransportRecovered"));
  listen("transportcapability", () => emit("onTransportCapability", { version: media.nativeTransportVersion, audioProcessing: media.nativeAudioProcessing }));
  listen("nativequeue", () => {
    const queue = media.nativeQueueSnapshot;
    if (!queue) return;
    clearTimeout(renewTimer);
    if (queue.currentVideoId !== id || queue.currentOccurrenceId !== nativeOccurrenceId) {
      const initialMeasurement = !nativeOccurrenceId && queue.currentVideoId === id ? asset?.loudness : null;
      nativeOccurrenceId = queue.currentOccurrenceId;
      id = queue.currentVideoId; title = queue.currentTitle; position = media.currentTime;
      asset = { duration: media.duration, loudness: queue.loudness || initialMeasurement || null };
      media.title = title;
      media.setAttribute("aria-label", title || "Music playback");
    } else if (queue.loudness && asset) {
      asset.loudness = queue.loudness;
    }
    ready = !queue.preparing;
    emit("onQueueChange", { ...queue, playing: media.nativePlayIntent, position: media.currentTime, duration: media.duration });
    if (queue.reason) emit("onQueueError", { reason: queue.reason });
    if (queue.preparing) setState(STATES.BUFFERING);
    void handoffQueue();
  });
  listen("playing", () => {
    if (media.isAndroidNativeMedia && !media.orderedTransport) intent = true;
    if (intent) setState(STATES.PLAYING);
    else if (!media.orderedTransport) media.pause();
  });
  listen("pause", () => { if (ready && !media.ended) { if (media.isAndroidNativeMedia && !media.orderedTransport) intent = false; setState(STATES.PAUSED); } });
  listen("waiting", () => { if (intent) setState(STATES.BUFFERING); });
  listen("ended", () => { position = media.currentTime; setState(STATES.ENDED); });
  listen("repeat", () => emit("onRepeat"));
  listen("repeatconfiguration", () => emit("onRepeatConfigured"));
  listen("error", () => {
    if (destroyed || !asset) return;
    if (!refreshed) {
      refreshed = true;
      if (ready) position = media.currentTime;
      void resolve(true);
    } else fallback("native_media_failed");
  });
  const deck = {
    provider: "native",
    androidNative: Boolean(media.isAndroidNativeMedia),
    get orderedTransport() { return Boolean(media.orderedTransport); },
    get nativeTransportVersion() { return media.nativeTransportVersion; },
    get nativeAudioProcessing() { return media.nativeAudioProcessing; },
    get nativeRepeatOne() { return media.nativeRepeatOne === true; },
    get nativeOccurrenceId() { return media.nativeQueueSnapshot?.currentOccurrenceId || null; },
    get nativeQueueOwned() { return media.nativeQueueSnapshot?.owns === true; },
    get nativePlayIntent() { return media.nativePlayIntent; },
    get nativeTransportRestored() { return Boolean(media.nativeTransportRestored); },
    get nativeObservedPlaying() { return media.nativeObservedPlaying; },
    get isResolving() { return !ready; },
    reconnectControls: () => media.reconnectTransport(),
    reloadTransportSource({ autoplay: nextIntent }) {
      if (destroyed) return;
      clearSource(); position = 0; intent = nextIntent === true; refreshed = false;
      void resolve();
    },
    playVideo() {
      if (destroyed) return;
      intent = true;
      if (!ready && controller?.signal.aborted) void resolve();
      else resume();
    },
    pauseVideo() { playAttempt++; intent = false; media.pause(); },
    seekTo(seconds) { position = Math.max(0, Number(seconds) || 0); if (ready) media.currentTime = Math.min(position, Math.max(0, deck.getDuration() - .1)); },
    setVolume(value) { media.volume = Math.max(0, Math.min(1, (Number(value) || 0) / 100)); },
    mute() { media.muted = true; },
    unMute() { media.muted = false; },
    getCurrentTime: () => ready ? media.currentTime : position,
    getDuration() {
      if (ready && Number.isFinite(media.duration) && media.duration > 0) return media.duration;
      return Number.isFinite(asset?.duration) && asset.duration > 0 ? asset.duration : 0;
    },
    getPlayerState: () => state,
    getVideoData: () => ({ video_id: id, title }),
    getIframe: () => media,
    configureAudio(settings) { audioSettings = settings; graph?.configure(settings); configureAndroidAudio(settings); },
    setRepeatOne(enabled) { return media.setNativeRepeatOne?.(enabled) ?? false; },
    configureQueue(configuration) {
      if (destroyed || !configuration || !Array.isArray(configuration.entries) || !configuration.entries.length
        || configuration.entries.length > 100 || !configuration.entries.some(entry => entry.occurrenceId === configuration.currentOccurrenceId)) return false;
      queueConfiguration = configuration;
      void handoffQueue();
      return true;
    },
    loadVideoById(value) {
      const nextId = typeof value === "string" ? value : value?.videoId;
      if (!/^[A-Za-z0-9_-]{11}$/.test(nextId || "")) { fallback("invalid_track"); return; }
      if (value?.occurrenceId && media.selectNativeQueue?.(value.occurrenceId)) {
        updateTitle(value, nextId); id = nextId; intent = true; position = 0;
        resume();
        return;
      }
      updateTitle(value, nextId);
      clearSource();
      id = nextId; position = Number(value?.startSeconds) || 0; intent = true; refreshed = false;
      void resolve();
    },
    cueVideoById(value) {
      const nextId = typeof value === "string" ? value : value?.videoId;
      if (!/^[A-Za-z0-9_-]{11}$/.test(nextId || "")) { fallback("invalid_track"); return; }
      updateTitle(value, nextId);
      intent = false; media.pause(); position = Number(value?.startSeconds) || 0;
      if (nextId === id) { if (ready) deck.seekTo(position); return; }
      // Unselected idle decks do not resolve or extract a new track.
      clearSource();
      id = nextId; refreshed = false; setState(STATES.CUED);
    },
    loadModule() {}, unloadModule() {}, setOption() {},
    destroy() {
      destroyed = true; generation++; playAttempt++; controller?.abort(); clearTimeout(renewTimer);
      retireQueue();
      cancelMediaReceipt(receipt);
      for (const [name, callback] of listeners) media.removeEventListener(name, callback);
      releaseSource(); media.remove(); graph?.close();
    },
  };
  void resolve();
  return deck;
}
