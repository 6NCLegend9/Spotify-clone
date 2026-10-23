// Android keeps decoded source audio in Media3, outside the WebView lifecycle.
// The existing authenticated resolver still supplies the signed source URL.
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
      try {
        const data = JSON.parse(message.data);
        listeners.get(data.id)?.(data);
      } catch { /* Ignore malformed native messages. */ }
    };
    installedBridge = bridge;
  }
  const media = document.createElement("audio");
  media.title = String(title);
  let id = `audio_${crypto.randomUUID()}`;
  let source = "", current = 0, duration = 0, muted = true, volume = 1, paused = true, ended = false, loaded = false, disposed = false;
  let pendingPlay;
  const post = (action, extra = {}) => { if (!disposed) bridge.postMessage(JSON.stringify({ id, action, ...extra })); };
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
    post("release");
    listeners.delete(id);
    id = `audio_${crypto.randomUUID()}`;
    listeners.set(id, receive);
    loaded = false; ended = false; paused = true; current = 0; duration = 0;
  };
  const clearSource = () => {
    if (disposed) return;
    if (source) resetNativeSource();
    source = "";
  };
  const receive = data => {
    if (disposed || !source) return;
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
  Object.defineProperties(media, {
    isAndroidNativeMedia: { value: true },
    src: { get: () => source, set: value => { const next = String(value || ""); if (!next) clearSource(); else { source = next; loaded = false; ended = false; } } },
    currentSrc: { get: () => source },
    duration: { get: () => duration },
    currentTime: { get: () => current, set: value => { post("seek", { value: Math.max(0, Number(value) || 0) }); } },
    paused: { get: () => paused },
    ended: { get: () => ended },
    muted: { get: () => muted, set: value => { muted = Boolean(value); post("volume", { value: muted ? 0 : volume }); } },
    volume: { get: () => volume, set: value => { volume = Math.max(0, Math.min(1, Number(value) || 0)); post("volume", { value: muted ? 0 : volume }); } },
  });
  media.load = () => {
    if (disposed) return;
    if (!source) return;
    // Retire the old ID so queued native replies cannot affect a new source.
    resetNativeSource();
    post("load", { url: source, title: String(media.title || "HayKasa").slice(0, 300) });
  };
  media.play = () => {
    if (!source || disposed) return Promise.resolve();
    if (pendingPlay) return pendingPlay.promise;
    if (!paused && !ended) return Promise.resolve();
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    pendingPlay = { promise, resolve, reject, timer: setTimeout(() => finishPlay(new Error("native_playback_timeout")), 30_000) };
    try { post("volume", { value: muted ? 0 : volume }); post("play"); }
    catch { finishPlay(new Error("native_playback_failed")); }
    return promise;
  };
  media.pause = () => { finishPlay(new DOMException("Playback paused", "AbortError")); paused = true; post("pause"); };
  const removeAttribute = media.removeAttribute.bind(media);
  media.removeAttribute = name => { if (String(name).toLowerCase() === "src") clearSource(); removeAttribute(name); };
  const remove = media.remove.bind(media);
  media.remove = () => { finishPlay(new DOMException("Playback disposed", "AbortError")); post("release"); disposed = true; listeners.delete(id); remove(); };
  return media;
}
