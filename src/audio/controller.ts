import type { AudioAdapter, AudioSessionStore, PlaybackToken } from "./types";
import { currentPlaybackToken, matchesPlaybackToken } from "./session";

const attachedStores = new WeakSet<object>();
const attachedAdapters = new WeakSet<object>();

/**
 * Bind once above the route tree. Queue edits and visual audio/video switches never reload media.
 * This transport port does not construct an Audio element or replace the existing YouTube decks.
 */
export function bindAudioController(store: AudioSessionStore, adapter: AudioAdapter): () => void {
  if (attachedStores.has(store) || attachedAdapters.has(adapter)) throw new Error("An audio controller is already attached.");
  attachedStores.add(store); attachedAdapters.add(adapter);
  let disposed = false;
  let loadNumber = 0;
  let playNumber = 0;
  let load: AbortController | null = null;
  let ready = false;
  let tokenKey: string | null = null;
  let lastPlaying = false;
  let lastVolume = -1;
  let lastSeek = -1;

  const fail = (token: PlaybackToken, error: unknown) => {
    if (disposed || !matchesPlaybackToken(store.getState(), token)) return;
    const name = error && typeof error === "object" && "name" in error ? error.name : "";
    if (name === "AbortError") return;
    store.dispatch({ type: "mediaStatus", token, status: name === "NotAllowedError" ? "blocked" : "error",
      message: name === "NotAllowedError" ? "Press Play to allow audio in this browser." : "Playback failed. Try playing the track again." });
  };
  const safe = (token: PlaybackToken | null, operation: () => void) => {
    try { operation(); } catch (error) { if (token) fail(token, error); }
  };
  const applyPlayback = (token: PlaybackToken) => {
    const state = store.getState();
    const attempt = ++playNumber;
    lastPlaying = state.isPlaying;
    if (!state.isPlaying) { safe(token, () => adapter.pause()); return; }
    try {
      Promise.resolve(adapter.play()).then(() => {
        if (disposed || !matchesPlaybackToken(store.getState(), token)) return;
        if (!store.getState().isPlaying) { safe(token, () => adapter.pause()); return; }
        // Actual playing state comes from the adapter event, not from optimistic UI state.
      }).catch((error: unknown) => {
        if (attempt === playNumber) fail(token, error);
      });
    } catch (error) { fail(token, error); }
  };
  const synchronize = () => {
    if (disposed) return;
    const state = store.getState();
    const token = currentPlaybackToken(state);
    const key = token ? `${token.entryId}:${token.playbackRevision}` : "";
    const volume = state.isMuted ? 0 : state.volume;
    if (volume !== lastVolume) {
      lastVolume = volume;
      safe(token, () => adapter.setVolume(volume));
    }
    if (key !== tokenKey) {
      tokenKey = key;
      const request = ++loadNumber;
      playNumber += 1;
      load?.abort(); load = null; ready = false;
      lastSeek = state.seekRevision;
      lastPlaying = state.isPlaying;
      safe(token, () => adapter.pause());
      if (!token || !state.current) return;
      const abort = new AbortController();
      load = abort;
      const seekAtLoad = state.seekRevision;
      const done = () => {
        if (disposed || abort.signal.aborted || request !== loadNumber || !matchesPlaybackToken(store.getState(), token)) return;
        ready = true;
        const current = store.getState();
        lastVolume = current.isMuted ? 0 : current.volume;
        safe(token, () => adapter.setVolume(lastVolume));
        if (current.seekRevision !== seekAtLoad) safe(token, () => adapter.seek(current.position));
        lastSeek = current.seekRevision;
        applyPlayback(token);
      };
      try {
        Promise.resolve(adapter.load(state.current.track, { token, position: state.position, signal: abort.signal }))
          .then(done).catch((error: unknown) => { if (request === loadNumber && !abort.signal.aborted) fail(token, error); });
      } catch (error) { fail(token, error); }
      return;
    }
    if (!ready || !token) return;
    if (lastSeek !== state.seekRevision) {
      lastSeek = state.seekRevision;
      safe(token, () => adapter.seek(state.position));
    }
    if (lastPlaying !== state.isPlaying) applyPlayback(token);
  };

  let unsubscribeMedia = () => {};
  let unsubscribeStore = () => {};
  const dispose = () => {
    if (disposed) return;
    disposed = true; loadNumber += 1; playNumber += 1;
    load?.abort();
    try { unsubscribeStore(); } finally {
      try { unsubscribeMedia(); } finally {
        attachedStores.delete(store); attachedAdapters.delete(adapter);
        adapter.dispose();
      }
    }
  };
  try {
    unsubscribeMedia = adapter.subscribe((event) => {
      if (disposed || !matchesPlaybackToken(store.getState(), event.token)) return;
      if (event.type === "ended") store.dispatch({ type: "advance", reason: "ended", token: event.token });
      else if (event.type === "progress") store.dispatch({ ...event, type: "progress" });
      else if (event.type === "status") {
        if (event.status === "playing" && !store.getState().isPlaying) {
          safe(event.token, () => adapter.pause());
          return;
        }
        store.dispatch({ type: "mediaStatus", token: event.token, status: event.status, message: event.message });
      }
    });
    unsubscribeStore = store.subscribe(synchronize);
    synchronize();
  } catch (error) { dispose(); throw error; }
  return dispose;
}
