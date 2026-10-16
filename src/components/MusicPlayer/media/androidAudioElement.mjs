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
  const id = `audio_${crypto.randomUUID()}`;
  let source = "", current = 0, duration = 0, muted = true, volume = 1, paused = true, ended = false, loaded = false, disposed = false;
  const post = (action, extra = {}) => { if (!disposed) bridge.postMessage(JSON.stringify({ id, action, ...extra })); };
  const emit = name => media.dispatchEvent(new Event(name));
  listeners.set(id, data => {
    if (disposed) return;
    current = Number.isFinite(data.position) ? Math.max(0, data.position) : current;
    duration = Number.isFinite(data.duration) ? Math.max(0, data.duration) : duration;
    if (data.event === "ready" && !loaded) { loaded = true; emit("loadedmetadata"); }
    if (data.event === "playing") { paused = false; ended = false; emit("playing"); }
    if (data.event === "pause") { paused = true; emit("pause"); }
    if (data.event === "ended") { ended = true; paused = true; emit("ended"); }
    if (data.event === "error") emit("error");
    if (data.event === "waiting") emit("waiting");
    if (data.event === "progress") emit("timeupdate");
  });
  Object.defineProperties(media, {
    isAndroidNativeMedia: { value: true },
    src: { get: () => source, set: value => { source = String(value || ""); loaded = false; ended = false; } },
    currentSrc: { get: () => source },
    duration: { get: () => duration },
    currentTime: { get: () => current, set: value => { current = Math.max(0, Number(value) || 0); post("seek", { value: current }); } },
    paused: { get: () => paused },
    ended: { get: () => ended },
    muted: { get: () => muted, set: value => { muted = Boolean(value); post("volume", { value: muted ? 0 : volume }); } },
    volume: { get: () => volume, set: value => { volume = Math.max(0, Math.min(1, Number(value) || 0)); post("volume", { value: muted ? 0 : volume }); } },
  });
  media.load = () => {
    if (source) { loaded = false; post("load", { url: source, title: String(title).slice(0, 300) }); }
  };
  media.play = () => { paused = false; post("volume", { value: muted ? 0 : volume }); post("play"); return Promise.resolve(); };
  media.pause = () => { paused = true; post("pause"); };
  const removeAttribute = media.removeAttribute.bind(media);
  media.removeAttribute = name => { if (name === "src") { source = ""; loaded = false; } removeAttribute(name); };
  const remove = media.remove.bind(media);
  media.remove = () => { post("release"); disposed = true; listeners.delete(id); remove(); };
  return media;
}
