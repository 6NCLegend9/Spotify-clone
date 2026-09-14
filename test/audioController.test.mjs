import test from "node:test";
import assert from "node:assert/strict";
import { loadAudioModules } from "./helpers/loadAudioModules.mjs";
const { session, controller, reducer, reduxPort } = loadAudioModules();
const { createAudioSession: initial, reduceAudioSession: apply, currentPlaybackToken: token } = session;
const { bindAudioController: bind } = controller;
const song = (id) => ({ id, provider: "native", title: id, artist: "Artist", duration: 100 });
const start = (ids = ["A", "B", "C"]) => ({ type: "startContext", tracks: ids.map(song), index: 0, context: { id: "p", type: "playlist", name: "Playlist" } });
function store() {
  let current = initial("alice"); const listeners = new Set();
  return { getState: () => current, dispatch: (command) => { current = apply(current, command); [...listeners].forEach((listener) => listener()); },
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); }, listeners };
}
function deferred() { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function fakeAdapter(options = {}) {
  const events = new Set(); const loads = []; const calls = [];
  return {
    loads, calls,
    load: (track, details) => { const pending = deferred(); loads.push({ track, ...details, ...pending }); calls.push(["load", track.id]); return pending.promise; },
    play: () => { calls.push(["play"]); return options.play?.(); },
    pause: () => { calls.push(["pause"]); options.pause?.(); },
    seek: (position) => calls.push(["seek", position]),
    setVolume: (volume) => calls.push(["volume", volume]),
    subscribe: (listener) => { events.add(listener); return () => events.delete(listener); },
    emit: (event) => [...events].forEach((listener) => listener(event)),
    dispose: () => calls.push(["dispose"]),
    count: (method) => calls.filter((call) => call[0] === method).length,
  };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));

test("an empty session silences the adapter without loading a track", () => {
  const s = store(); const media = fakeAdapter(); const detach = bind(s, media);
  assert.equal(media.count("load"), 0); assert.equal(media.count("pause"), 1); detach();
});
test("selection loads once, and playback waits until the provider is ready", async () => {
  const s = store(); const media = fakeAdapter(); const detach = bind(s, media); s.dispatch(start());
  assert.equal(media.count("load"), 1); assert.equal(media.count("play"), 0);
  media.loads[0].resolve(); await settle(); assert.equal(media.count("play"), 1); detach();
});
test("queue mutations, shuffle and clock updates do not reload or seek media", async () => {
  const s = store(); const media = fakeAdapter(); const detach = bind(s, media); s.dispatch(start());
  media.loads[0].resolve(); await settle();
  s.dispatch({ type: "enqueue", track: song("X"), placement: "next" });
  s.dispatch({ type: "setShuffle", enabled: true, seed: 19 });
  s.dispatch({ type: "clearUserQueue" });
  for (let i = 0; i < 30; i += 1) media.emit({ type: "progress", token: token(s.getState()), position: i });
  assert.equal(media.count("load"), 1); assert.equal(media.count("seek"), 0); detach();
});
test("user seeks reach the same media instance once per seek revision", async () => {
  const s = store(); const media = fakeAdapter(); const detach = bind(s, media); s.dispatch(start()); media.loads[0].resolve(); await settle();
  s.dispatch({ type: "seek", position: 35 });
  assert.deepEqual(media.calls.filter((item) => item[0] === "seek"), [["seek", 35]]); assert.equal(media.count("load"), 1); detach();
});
test("a seek made while loading is applied before starting playback", async () => {
  const s = store(); const media = fakeAdapter(); const detach = bind(s, media); s.dispatch(start()); s.dispatch({ type: "seek", position: 47 });
  media.loads[0].resolve(); await settle();
  const relevant = media.calls.filter((item) => ["seek", "play"].includes(item[0]));
  assert.deepEqual(relevant, [["seek", 47], ["play"]]); detach();
});
test("a late load completion for a replaced track cannot start it", async () => {
  const s = store(); const media = fakeAdapter(); const detach = bind(s, media); s.dispatch(start()); const old = media.loads[0];
  s.dispatch({ type: "advance", reason: "skip" }); assert.equal(old.signal.aborted, true);
  old.resolve(); await settle(); assert.equal(media.count("play"), 0);
  media.loads[1].resolve(); await settle(); assert.equal(media.count("play"), 1); assert.equal(s.getState().current.track.id, "B"); detach();
});
test("duplicate consecutive songs are separate load epochs", async () => {
  const s = store(); const media = fakeAdapter(); const detach = bind(s, media); s.dispatch(start(["A", "A"])); media.loads[0].resolve(); await settle();
  s.dispatch({ type: "advance", reason: "skip" });
  assert.equal(media.loads.length, 2); assert.equal(media.loads[0].track.id, media.loads[1].track.id);
  assert.notDeepEqual(media.loads[0].token, media.loads[1].token); detach();
});
test("stale end, progress and error callbacks cannot affect a new track", async () => {
  const s = store(); const media = fakeAdapter(); const detach = bind(s, media); s.dispatch(start()); const old = token(s.getState());
  s.dispatch({ type: "advance", reason: "skip" });
  media.emit({ type: "ended", token: old }); media.emit({ type: "progress", token: old, position: 87 });
  media.emit({ type: "status", token: old, status: "error", message: "old" });
  assert.equal(s.getState().current.track.id, "B"); assert.equal(s.getState().position, 0); assert.equal(s.getState().error, null); detach();
});
test("natural end consumes the user queue before the context queue", async () => {
  const s = store(); const media = fakeAdapter(); const detach = bind(s, media); s.dispatch(start());
  s.dispatch({ type: "enqueue", track: song("X"), placement: "last" });
  media.emit({ type: "ended", token: token(s.getState()) }); assert.equal(s.getState().current.track.id, "X"); detach();
});
test("paused intent is respected when a pending load completes", async () => {
  const s = store(); const media = fakeAdapter(); const detach = bind(s, media); s.dispatch(start()); s.dispatch({ type: "setPlaying", playing: false });
  media.loads[0].resolve(); await settle(); assert.equal(media.count("play"), 0); assert.equal(s.getState().isPlaying, false); detach();
});
test("a late play promise cannot override a subsequent pause", async () => {
  const pending = deferred(); const s = store(); const media = fakeAdapter({ play: () => pending.promise }); const detach = bind(s, media);
  s.dispatch(start()); media.loads[0].resolve(); await settle(); s.dispatch({ type: "setPlaying", playing: false });
  const paused = media.count("pause"); pending.resolve(); await settle();
  assert.equal(media.count("pause"), paused + 1); assert.equal(s.getState().isPlaying, false); detach();
});
test("browser autoplay rejection produces recoverable blocked state", async () => {
  const blocked = new Error("not allowed"); blocked.name = "NotAllowedError";
  const s = store(); const media = fakeAdapter({ play: () => Promise.reject(blocked) }); const detach = bind(s, media);
  s.dispatch(start()); media.loads[0].resolve(); await settle(); assert.equal(s.getState().status, "blocked"); assert.equal(s.getState().isPlaying, false);
  s.dispatch({ type: "setPlaying", playing: true }); assert.equal(media.loads.length, 2); detach();
});
test("load failure is surfaced, and retry starts a fresh abortable load", async () => {
  const s = store(); const media = fakeAdapter(); const detach = bind(s, media); s.dispatch(start()); media.loads[0].reject(new Error("fail")); await settle();
  assert.equal(s.getState().status, "error"); s.dispatch({ type: "setPlaying", playing: true });
  assert.equal(media.loads.length, 2); detach();
});
test("volume and mute are applied without losing configured volume or reloading", async () => {
  const s = store(); const media = fakeAdapter(); const detach = bind(s, media); s.dispatch(start()); media.loads[0].resolve(); await settle();
  s.dispatch({ type: "setVolume", volume: 0.31 }); s.dispatch({ type: "setMuted", muted: true }); s.dispatch({ type: "setMuted", muted: false });
  assert.deepEqual(media.calls.filter((call) => call[0] === "volume").slice(-3), [["volume", 0.31], ["volume", 0], ["volume", 0.31]]);
  assert.equal(media.loads.length, 1); detach();
});
test("duplicate controller attachment is rejected for both store and adapter", () => {
  const s = store(); const media = fakeAdapter(); const detach = bind(s, media);
  assert.throws(() => bind(s, fakeAdapter()), /already attached/);
  assert.throws(() => bind(store(), media), /already attached/); detach();
});
test("cleanup aborts pending load and removes every subscription", async () => {
  const s = store(); const media = fakeAdapter(); const detach = bind(s, media); s.dispatch(start()); const pending = media.loads[0];
  detach(); detach(); assert.equal(s.listeners.size, 0); assert.equal(media.count("dispose"), 1); assert.equal(pending.signal.aborted, true);
  pending.resolve(); await settle(); assert.equal(media.count("play"), 0);
  media.emit({ type: "ended", token: token(s.getState()) }); assert.equal(s.getState().current.track.id, "A");
});
test("account reset aborts the previous user's pending media work", async () => {
  const s = store(); const media = fakeAdapter(); const detach = bind(s, media); s.dispatch(start()); const pending = media.loads[0];
  s.dispatch({ type: "reset", owner: "bob" }); assert.equal(pending.signal.aborted, true);
  pending.resolve(); await settle(); assert.equal(media.count("play"), 0); assert.equal(s.getState().current, null); detach();
});
test("a StrictMode-style detach/rebind does not retain a controller lock", () => {
  const s = store(); const media = fakeAdapter(); const detach = bind(s, media); detach();
  const second = bind(s, media); second(); assert.equal(media.count("dispose"), 2);
});
test("the Redux port uses the existing store, not a parallel mutable state copy", () => {
  let root = { player: { session: initial("alice") }, route: "/" }; const listeners = new Set();
  const redux = { getState: () => root,
    dispatch: (action) => { root = { ...root, player: { session: reducer.default(root.player.session, action) } }; listeners.forEach((listener) => listener()); },
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); } };
  const port = reduxPort.createReduxAudioPort(redux, (state) => state.player.session);
  let updates = 0; const unsubscribe = port.subscribe(() => { updates += 1; }); port.dispatch(start());
  assert.equal(port.getState(), root.player.session); assert.equal(updates, 1);
  redux.dispatch({ type: "router/navigate" }); assert.equal(updates, 1); unsubscribe(); assert.equal(listeners.size, 0);
});
test("a late PLAYING event is silenced when user intent is paused", async () => {
  const s = store(); const media = fakeAdapter(); const detach = bind(s, media); s.dispatch(start()); media.loads[0].resolve(); await settle();
  s.dispatch({ type: "setPlaying", playing: false }); const before = media.count("pause");
  media.emit({ type: "status", token: token(s.getState()), status: "playing" });
  assert.equal(media.count("pause"), before + 1); assert.equal(s.getState().isPlaying, false); detach();
});
test("an old play rejection cannot fail a newer playing track", async () => {
  const pending = deferred(); let attempts = 0;
  const s = store(); const media = fakeAdapter({ play: () => ++attempts === 1 ? pending.promise : undefined }); const detach = bind(s, media);
  s.dispatch(start()); media.loads[0].resolve(); await settle(); s.dispatch({ type: "advance", reason: "skip" });
  media.loads[1].resolve(); await settle(); pending.reject(new Error("late")); await settle();
  assert.equal(s.getState().current.track.id, "B"); assert.equal(s.getState().error, null); detach();
});
