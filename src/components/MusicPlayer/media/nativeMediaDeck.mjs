import { MEDIA_PLAYER_STATES as STATES } from "./mediaPlayerStates.mjs";
import { resolveMediaAsset, cancelMediaReceipt } from "./resolveMediaAsset.mjs";
import { createNativeAudioGraph } from "./nativeAudioGraph.mjs";

export function createNativeMediaDeck({ host, videoId, mode, maxHeight, profile, autoplay = true, startSeconds = 0, title = "", events = {}, onAsset, onFallback, audioSettings }) {
  const media = document.createElement(mode === "video" ? "video" : "audio");
  media.crossOrigin = "anonymous";
  media.preload = "auto";
  media.playsInline = true;
  media.setAttribute("playsinline", "");
  media.setAttribute("aria-label", title || "Music playback");
  media.style.cssText = "width:100%;height:100%;object-fit:contain";
  media.muted = true;
  host.replaceChildren(media);
  let id = videoId, state = STATES.UNSTARTED, intent = autoplay, position = startSeconds;
  let generation = 0, controller, receipt, asset, ready = false, destroyed = false, refreshed = false, renewTimer, graph, announcedReady = false;
  const emit = (name, data) => { if (!destroyed) events[name]?.({ target: deck, data }); };
  const setState = (next) => { state = next; emit("onStateChange", next); };
  const fallback = (reason) => {
    if (destroyed) return;
    const snapshot = { position: ready ? media.currentTime : position, playing: intent, reason };
    media.pause();
    controller?.abort();
    clearTimeout(renewTimer);
    onFallback?.(snapshot);
  };
  const listeners = new Map();
  const listen = (name, callback) => { listeners.set(name, callback); media.addEventListener(name, callback); };
  const resume = () => {
    if (!ready || destroyed || !intent) return;
    try { graph ||= createNativeAudioGraph(media, audioSettings); } catch { /* Native output remains available. */ }
    const context = graph?.resume();
    const playback = media.play();
    Promise.all([context, playback]).catch((error) => {
      if (destroyed || error?.name === "AbortError") return;
      if (error?.name === "NotAllowedError") {
        intent = false;
        media.pause();
        emit("onAutoplayBlocked");
      } else fallback("native_playback_failed");
    });
  };
  async function resolve(renew = false) {
    const own = ++generation;
    controller?.abort();
    controller = new AbortController();
    ready = false;
    asset = null;
    setState(STATES.BUFFERING);
    try {
      const result = await resolveMediaAsset({ videoId: id, mode, maxHeight, profile }, { signal: controller.signal, receipt: renew ? receipt : undefined, onPending: (pending) => { if (own === generation) receipt = pending.receipt; } });
      if (destroyed || own !== generation) { cancelMediaReceipt(result.receipt); return; }
      receipt = result.receipt;
      asset = result.asset;
      onAsset?.(result);
      media.src = asset.url;
      media.load();
      clearTimeout(renewTimer);
      renewTimer = setTimeout(() => {
        if (destroyed) return;
        position = media.currentTime || position;
        media.pause();
        refreshed = true;
        void resolve(true);
      }, Math.min(2_147_483_647, Math.max(1000, asset.expiresAt - Date.now() - 60_000)));
    } catch (error) {
      if (!destroyed && own === generation && !controller.signal.aborted) fallback(error.message || "resolution_failed");
    }
  }
  listen("loadedmetadata", () => {
    if (destroyed || !asset || media.currentSrc !== asset.url) return;
    ready = true;
    const duration = Number.isFinite(media.duration) ? media.duration : asset?.duration || 0;
    media.currentTime = Math.max(0, Math.min(position, Math.max(0, duration - .1)));
    if (!announcedReady) { announcedReady = true; emit("onReady"); }
    if (intent) resume(); else setState(STATES.CUED);
  });
  listen("playing", () => { if (intent) setState(STATES.PLAYING); else media.pause(); });
  listen("pause", () => { if (ready && !media.ended) setState(STATES.PAUSED); });
  listen("waiting", () => { if (intent) setState(STATES.BUFFERING); });
  listen("ended", () => { position = media.currentTime; setState(STATES.ENDED); });
  listen("error", () => {
    if (destroyed || !asset) return;
    if (!refreshed) {
      refreshed = true;
      position = media.currentTime || position;
      void resolve(true);
    } else fallback("native_media_failed");
  });
  const deck = {
    provider: "native",
    get isResolving() { return !ready; },
    playVideo() { intent = true; resume(); },
    pauseVideo() { intent = false; media.pause(); },
    seekTo(seconds) { position = Math.max(0, Number(seconds) || 0); if (ready) media.currentTime = Math.min(position, Math.max(0, deck.getDuration() - .1)); },
    setVolume(value) { media.volume = Math.max(0, Math.min(1, (Number(value) || 0) / 100)); },
    mute() { media.muted = true; },
    unMute() { media.muted = false; },
    getCurrentTime: () => ready ? media.currentTime : position,
    getDuration: () => ready && Number.isFinite(media.duration) ? media.duration : asset?.duration || 0,
    getPlayerState: () => state,
    getVideoData: () => ({ video_id: id, title }),
    getIframe: () => media,
    configureAudio(settings) { audioSettings = settings; graph?.configure(settings); },
    loadVideoById(value) {
      const nextId = typeof value === "string" ? value : value.videoId;
      if (!/^[A-Za-z0-9_-]{11}$/.test(nextId || "")) { fallback("invalid_track"); return; }
      ready = false; media.pause(); media.removeAttribute("src"); media.load(); cancelMediaReceipt(receipt); receipt = null; asset = null;
      id = nextId; position = Number(value?.startSeconds) || 0; intent = true; refreshed = false;
      void resolve();
    },
    cueVideoById(value) {
      const nextId = typeof value === "string" ? value : value.videoId;
      intent = false; media.pause(); position = Number(value?.startSeconds) || 0;
      if (nextId === id) { if (ready) deck.seekTo(position); return; }
      // Unselected idle decks do not resolve or extract a new track.
      id = nextId; ready = false; controller?.abort(); cancelMediaReceipt(receipt); receipt = null;
    },
    loadModule() {}, unloadModule() {}, setOption() {},
    destroy() {
      destroyed = true; generation++; controller?.abort(); clearTimeout(renewTimer);
      cancelMediaReceipt(receipt);
      for (const [name, callback] of listeners) media.removeEventListener(name, callback);
      media.pause(); media.removeAttribute("src"); media.load(); media.remove(); graph?.close();
    },
  };
  void resolve();
  return deck;
}
