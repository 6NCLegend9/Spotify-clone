// Android keeps decoded source audio in Media3, outside the WebView lifecycle.
// The existing authenticated resolver still supplies the signed source URL.
import { createOrderedAndroidTransport, nativeTransportError } from "./orderedAndroidTransport.mjs";
const listeners = new Map();
let installedBridge;
export function hasAndroidAudioBridge() {
  return globalThis.location?.origin === "https://haykasa.vercel.app"
    && typeof globalThis.window?.HayKasaAndroidMedia?.postMessage === "function";
}
export function createAndroidAudioElement(title = "") {
  if (!hasAndroidAudioBridge()) return null;
  const bridge = window.HayKasaAndroidMedia;
  if (installedBridge !== bridge) {
    bridge.onmessage = (message) => {
      if (typeof message.data !== "string" || message.data.length > 12288) return;
      let data;
      try {
        data = JSON.parse(message.data);
      } catch { /* Ignore malformed native messages. */ }
      if (data) listeners.get(data.id)?.(data);
    };
    installedBridge = bridge;
  }
  const media = document.createElement("audio");
  media.title = String(title);
  let id = `audio_${crypto.randomUUID()}`;
  let source = "", current = 0, duration = 0, muted = true, volume = 1, paused = true, ended = false, loaded = false, disposed = false;
  let pendingPlay;
  let legacyLoaded = false;
  let ordered, transportError, observedPlaying = false, announcedPlaying = false, announcedPause = true, decoderError = false, lastIntent, lastWaiting = false;
  const post = (action, extra = {}) => {
    if (disposed) return;
    bridge.postMessage(JSON.stringify({ id, action, ...extra }));
    if (action === "load") legacyLoaded = true;
    else if (action === "release") legacyLoaded = false;
  };
  const emit = name => media.dispatchEvent(new Event(name));
  const finishPlay = error => {
    if (!pendingPlay) return;
    const attempt = pendingPlay;
    pendingPlay = null;
    clearTimeout(attempt.timer);
    if (error) attempt.reject(error); else attempt.resolve();
  };
  const resetNativeSource = () => {
    finishPlay(new DOMException("Playback source changed", "AbortError"));
    if (ordered) { ordered.dispose(); ordered = null; } else if (legacyLoaded) post("release");
    listeners.delete(id);
    id = `audio_${crypto.randomUUID()}`;
    listeners.set(id, receive);
    loaded = false; ended = false; paused = true; current = 0; duration = 0;
    observedPlaying = false; announcedPlaying = false; announcedPause = true; decoderError = false; lastIntent = undefined; lastWaiting = false; transportError = null;
  };
  const clearSource = () => {
    if (disposed) return;
    if (source) resetNativeSource();
    source = "";
  };
  const receive = data => {
    if (disposed || !source) return;
    if (ordered) { ordered.receive(data); return; }
    if (typeof data.playing === "boolean") observedPlaying = data.playing;
    else if (data.event === "playing") observedPlaying = true;
    else if (["pause", "ended", "waiting", "error"].includes(data.event)) observedPlaying = false;
    current = Number.isFinite(data.position) ? Math.max(0, data.position) : current;
    duration = Number.isFinite(data.duration) ? Math.max(0, data.duration) : duration;
    if (data.event === "ready" && !loaded) { loaded = true; emit("loadedmetadata"); }
    if (data.event === "playing") { paused = false; ended = false; finishPlay(); emit("playing"); }
    if (data.event === "pause") { paused = true; finishPlay(new DOMException("Playback paused", "AbortError")); emit("pause"); }
    if (data.event === "ended") { ended = true; paused = true; finishPlay(new DOMException("Playback ended", "AbortError")); emit("ended"); }
    if (data.event === "error") { finishPlay(new Error("native_media_failed")); emit("error"); }
    if (data.event === "waiting") emit("waiting");
    if (data.event === "progress") emit("timeupdate");
    if (data.event === "seeked") { emit("seeked"); emit("timeupdate"); }
  };
  listeners.set(id, receive);
  const beginLoad = () => {
    const own = createOrderedAndroidTransport({ bridge, id,
      send: value => { if (!disposed) bridge.postMessage(JSON.stringify(value)); },
      onLegacy: () => {
        if (disposed || ordered !== own) return { play: () => Promise.reject(new DOMException("Source retired", "AbortError")), pause() {} };
        ordered = null;
        post("load", { url: source, title: String(media.title || "HayKasa").slice(0, 300) });
        return { play: () => media.play(), pause: () => media.pause() };
      },
      onFailure: error => {
        if (disposed || ordered !== own) return;
        transportError = error;
        emit("transporterror");
      },
      onRecovered: () => {
        if (disposed || ordered !== own) return;
        transportError = null;
        emit("transportrecovered");
      },
      onDecoderError: () => {
        if (disposed || ordered !== own || decoderError) return;
        decoderError = true;
        emit("error");
      },
      onUpdate: packet => {
        if (disposed || ordered !== own || !source) return;
        const beforeEnded = ended;
        let view = own.view();
        current = view.position; duration = view.duration; observedPlaying = view.observedPlaying;
        const publishIntent = () => {
          const latest = own.view();
          if (latest.intent !== lastIntent) { lastIntent = latest.intent; emit("transportintent"); }
        };
        if (own.restored) publishIntent();
        if (view.ready && !loaded) { loaded = true; emit("loadedmetadata"); }
        // loadedmetadata can synchronously issue the latest Play/Pause request.
        // Re-read its overlay before deciding whether to emit DOM playing.
        view = own.view(); paused = view.paused; ended = view.ended;
        publishIntent();
        view = own.view();
        if (view.intent) announcedPause = false;
        if (view.playing) { if (!announcedPlaying) emit("playing"); announcedPlaying = true; lastWaiting = false; }
        else {
          announcedPlaying = false;
          if (view.confirmedPause && !announcedPause) { announcedPause = true; emit("pause"); lastWaiting = false; }
          else if (view.intent && !view.ended && !lastWaiting) { lastWaiting = true; emit("waiting"); }
        }
        if (view.ended && view.intent && !beforeEnded) emit("ended");
        if (packet.event === "seeked") emit("seeked");
        if (packet.event === "error" && !decoderError) { decoderError = true; emit("error"); }
        emit("timeupdate");
      },
    });
    ordered = own;
    if (own) own.start(source, String(media.title || "HayKasa").slice(0, 300));
    else post("load", { url: source, title: String(media.title || "HayKasa").slice(0, 300) });
  };
  Object.defineProperties(media, {
    isAndroidNativeMedia: { value: true },
    orderedTransport: { get: () => Boolean(ordered?.supported) },
    nativePlayIntent: { get: () => ordered ? ordered.desired : !paused },
    nativeIntentOrigin: { get: () => ordered?.view().origin || "baseline" },
    nativeObservedPlaying: { get: () => observedPlaying },
    nativeTransportRestored: { get: () => Boolean(ordered?.restored) },
    nativeTransportError: { get: () => transportError },
    src: { get: () => source, set: value => { const next = String(value || ""); if (!next) clearSource(); else { source = next; loaded = false; ended = false; } } },
    currentSrc: { get: () => source },
    duration: { get: () => duration },
    currentTime: { get: () => current, set: value => {
      const seconds = Math.max(0, Number(value) || 0);
      if (!Number.isFinite(seconds)) return;
      if (ordered) ordered.seek(seconds); else post("seek", { value: seconds });
    } },
    paused: { get: () => paused },
    ended: { get: () => ended },
    muted: { get: () => muted, set: value => { muted = Boolean(value); if (ordered) ordered.volume(muted ? 0 : volume); else post("volume", { value: muted ? 0 : volume }); } },
    volume: { get: () => volume, set: value => { volume = Math.max(0, Math.min(1, Number(value) || 0)); if (ordered) ordered.volume(muted ? 0 : volume); else post("volume", { value: muted ? 0 : volume }); } },
  });
  media.load = () => {
    if (disposed) return;
    if (!source) return;
    // Retire the old ID so queued native replies cannot affect a new source.
    resetNativeSource();
    beginLoad();
  };
  media.play = () => {
    if (!source || disposed) return Promise.resolve();
    if (ordered) {
      lastIntent = true;
      if (ended) ordered.seek(0);
      ordered.volume(muted ? 0 : volume);
      return ordered.play();
    }
    if (pendingPlay) return pendingPlay.promise;
    if (!paused && !ended) return Promise.resolve();
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    pendingPlay = { promise, resolve, reject, timer: setTimeout(() => finishPlay(new Error("native_playback_timeout")), 30_000) };
    try { post("volume", { value: muted ? 0 : volume }); post("play"); }
    catch { finishPlay(new Error("native_playback_failed")); }
    return promise;
  };
  media.pause = () => {
    finishPlay(new DOMException("Playback paused", "AbortError")); paused = true;
    if (ordered) { lastIntent = false; announcedPlaying = false; ordered.pause(); } else post("pause");
  };
  media.reconnectTransport = () => ordered ? ordered.recover() : Promise.reject(nativeTransportError("UNSUPPORTED"));
  const removeAttribute = media.removeAttribute.bind(media);
  media.removeAttribute = name => { if (String(name).toLowerCase() === "src") clearSource(); removeAttribute(name); };
  const remove = media.remove.bind(media);
  media.remove = () => { finishPlay(new DOMException("Playback disposed", "AbortError")); if (ordered) ordered.dispose(); else if (legacyLoaded) post("release"); ordered = null; disposed = true; listeners.delete(id); remove(); };
  return media;
}
