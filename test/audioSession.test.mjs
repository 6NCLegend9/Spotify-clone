import test from "node:test";
import assert from "node:assert/strict";
import { loadAudioModules } from "./helpers/loadAudioModules.mjs";
const { session, reducer } = loadAudioModules();
const { createAudioSession: initial, reduceAudioSession: apply, currentPlaybackToken: token,
  playingFrom, normalizeAudioTrack, safeInternalHref, MAX_HISTORY, MAX_CONTEXT_TRACKS, MAX_USER_QUEUE } = session;
const song = (id) => ({ id, provider: "native", title: id, artist: "Artist", duration: 240 });
const context = { id: "playlist-a", type: "playlist", name: "Night Drive", href: "/library/playlist/a" };
const begin = (ids = ["A", "B", "C", "D"], index = 1) => apply(initial("alice"), { type: "startContext", tracks: ids.map(song), index, context });
const enqueue = (state, id, placement = "last") => apply(state, { type: "enqueue", track: song(id), placement });
const next = (state) => apply(state, { type: "advance", reason: "skip" });
const ended = (state) => apply(state, { type: "advance", reason: "ended", token: token(state) });
const ids = (items) => items.map((entry) => entry.track.id);
function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze); return Object.freeze(value);
}
function invariant(state) {
  const all = [...state.history, ...(state.current ? [state.current] : []), ...state.userQueue, ...state.contextQueue];
  assert.equal(new Set(all.map((entry) => entry.entryId)).size, all.length, "occurrence IDs must be unique");
  assert.ok(state.history.length <= MAX_HISTORY);
  assert.ok(state.userQueue.every((entry) => entry.origin === "user"));
  assert.ok(state.contextQueue.every((entry) => entry.origin === "context"));
  assert.ok(Number.isFinite(state.position) && state.position >= 0);
  assert.ok(state.duration === 0 || state.position <= state.duration);
  assert.ok(state.volume >= 0 && state.volume <= 1);
}

test("initial state is independently allocated, serializable and silent", () => {
  const a = initial(); const b = initial();
  assert.notEqual(a.userQueue, b.userQueue); assert.equal(a.isPlaying, false);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), a);
});
test("selecting B retains the ENTIRE container and queues only C, D", () => {
  const state = begin(); assert.equal(state.current.track.id, "B");
  assert.deepEqual(state.context.tracks.map((track) => track.id), ["A", "B", "C", "D"]);
  assert.deepEqual(ids(state.contextQueue), ["C", "D"]);
  assert.equal(playingFrom(state), "Playing from Night Drive");
});
test("B -> Play Next X -> Add Y -> C -> D", () => {
  let state = enqueue(enqueue(begin(), "X", "next"), "Y");
  const order = [state.current.track.id];
  for (let i = 0; i < 4; i += 1) { state = next(state); order.push(state.current.track.id); }
  assert.deepEqual(order, ["B", "X", "Y", "C", "D"]);
});
test("successive Play Next commands put the last requested item first", () => {
  const state = enqueue(enqueue(begin(), "X", "next"), "Y", "next");
  assert.deepEqual(ids(state.userQueue), ["Y", "X"]);
});
test("Add to Queue preserves FIFO order ahead of the context", () => {
  const state = enqueue(enqueue(begin(), "X"), "Y");
  assert.deepEqual(ids(state.userQueue), ["X", "Y"]); assert.equal(next(state).current.track.id, "X");
});
test("duplicate songs are separate occurrences, including the current song", () => {
  const state = enqueue(enqueue(begin(), "B"), "B");
  assert.equal(state.userQueue.length, 2); invariant(state);
  const first = next(state); const second = next(first);
  assert.equal(first.current.track.id, second.current.track.id);
  assert.notEqual(first.current.entryId, second.current.entryId);
  assert.notEqual(token(first).playbackRevision, token(second).playbackRevision);
});
test("duplicate tracks inside a playlist retain their own positions", () => {
  let state = begin(["A", "A", "B"], 0); const first = state.current.entryId;
  state = next(state); assert.equal(state.current.track.id, "A"); assert.notEqual(state.current.entryId, first);
  assert.equal(next(state).current.track.id, "B");
});
test("Clear Queue removes only user items and does not restart or stop playback", () => {
  let state = apply(enqueue(begin(), "X"), { type: "seek", position: 64 });
  const cleared = apply(freeze(state), { type: "clearUserQueue" });
  assert.deepEqual(cleared.userQueue, []); assert.equal(cleared.contextQueue, state.contextQueue);
  assert.equal(cleared.current, state.current); assert.equal(cleared.position, 64);
  assert.equal(cleared.isPlaying, true); assert.deepEqual(token(cleared), token(state));
});
test("starting another context preserves user choices by default", () => {
  let state = enqueue(begin(), "X"); const user = state.userQueue;
  state = apply(state, { type: "startContext", tracks: [song("P"), song("Q")], index: 0, context: { ...context, id: "album-b", type: "album", name: "Album B" } });
  assert.equal(state.userQueue, user); assert.equal(state.current.track.id, "P");
  assert.equal(next(state).current.track.id, "X");
  assert.equal(playingFrom(state), "Playing from Album B");
});
test("a caller can explicitly request a fresh user queue", () => {
  const state = apply(enqueue(begin(), "X"), { type: "startContext", tracks: [song("Q")], index: 0, context, preserveUserQueue: false });
  assert.deepEqual(state.userQueue, []);
});
test("removing one duplicate does not remove another or the original playlist entry", () => {
  let state = enqueue(enqueue(begin(), "C"), "C");
  state = apply(state, { type: "remove", entryId: state.userQueue[0].entryId });
  assert.deepEqual(ids(state.userQueue), ["C"]); assert.deepEqual(ids(state.contextQueue), ["C", "D"]);
});
test("the current track and history cannot be removed as upcoming entries", () => {
  const state = next(begin()); assert.equal(apply(state, { type: "remove", entryId: state.current.entryId }), state);
  assert.equal(apply(state, { type: "remove", entryId: state.history[0].entryId }), state);
});
test("move supports arbitrary user-queue positions by occurrence ID", () => {
  const state = ["X", "Y", "Z"].reduce((s, id) => enqueue(s, id), begin());
  const moved = apply(freeze(state), { type: "move", entryId: state.userQueue[2].entryId, destination: "user", beforeEntryId: state.userQueue[0].entryId });
  assert.deepEqual(ids(moved.userQueue), ["Z", "X", "Y"]); assert.equal(moved.current, state.current);
});
test("move to end and context reordering do not modify saved container order", () => {
  const state = begin(["A", "B", "C", "D"], 0);
  const moved = apply(state, { type: "move", entryId: state.contextQueue[0].entryId, destination: "context", beforeEntryId: null });
  assert.deepEqual(ids(moved.contextQueue), ["C", "D", "B"]); assert.equal(moved.context, state.context);
});
test("dragging a context occurrence into the user queue promotes only that occurrence", () => {
  const state = enqueue(begin(), "X");
  const moved = apply(state, { type: "move", entryId: state.contextQueue[1].entryId, destination: "user", beforeEntryId: state.userQueue[0].entryId });
  assert.deepEqual(ids(moved.userQueue), ["D", "X"]); assert.deepEqual(ids(moved.contextQueue), ["C"]);
  assert.equal(moved.context, state.context); invariant(moved);
});
test("invalid moves cannot remove an item or demote user choices accidentally", () => {
  const state = enqueue(begin(), "X");
  assert.equal(apply(state, { type: "move", entryId: state.userQueue[0].entryId, destination: "context", beforeEntryId: null }), state);
  assert.equal(apply(state, { type: "move", entryId: state.contextQueue[0].entryId, destination: "context", beforeEntryId: "missing" }), state);
});
test("selecting a queued user item plays it without discarding other explicit choices", () => {
  const state = enqueue(enqueue(begin(), "X"), "Y");
  const selected = apply(state, { type: "selectQueued", entryId: state.userQueue[1].entryId });
  assert.equal(selected.current.track.id, "Y"); assert.deepEqual(ids(selected.userQueue), ["X"]);
});
test("selecting a context item skips its preceding context items, not the user queue", () => {
  const state = enqueue(begin(), "X"); const selected = apply(state, { type: "selectQueued", entryId: state.contextQueue[1].entryId });
  assert.equal(selected.current.track.id, "D"); assert.deepEqual(selected.contextQueue, []);
  assert.deepEqual(ids(selected.userQueue), ["X"]);
});
test("Previous traverses actual listening history through manual queue items", () => {
  let state = enqueue(enqueue(begin(), "X"), "Y"); state = next(next(next(state)));
  assert.equal(state.current.track.id, "C");
  state = apply(state, { type: "previous" }); assert.equal(state.current.track.id, "Y");
  state = apply(state, { type: "previous" }); assert.equal(state.current.track.id, "X");
  state = apply(state, { type: "previous" }); assert.equal(state.current.track.id, "B");
  const order = []; for (let i = 0; i < 3; i += 1) { state = next(state); order.push(state.current.track.id); invariant(state); }
  assert.deepEqual(order, ["X", "Y", "C"]);
});
test("Previous with no history restarts the current occurrence, not a new random track", () => {
  const state = begin(); const prev = apply(state, { type: "previous" });
  assert.equal(prev.current.entryId, state.current.entryId); assert.equal(prev.position, 0);
  assert.equal(prev.playbackRevision, state.playbackRevision + 1);
});
test("history is bounded to the 50 actual previous occurrences", () => {
  let state = begin(Array.from({ length: 80 }, (_, i) => `track-${i}`), 0);
  for (let i = 0; i < 70; i += 1) state = next(state);
  assert.equal(state.history.length, 50); assert.equal(state.history[0].track.id, "track-20");
});
test("repeat off stops at end and retains the last track", () => {
  const state = ended(begin(["A"], 0)); assert.equal(state.status, "ended"); assert.equal(state.isPlaying, false);
  assert.equal(state.current.track.id, "A"); assert.equal(ended(state), state);
});
test("repeat track restarts on natural end, but manual Next honors user choices", () => {
  const state = apply(enqueue(begin(), "X"), { type: "setRepeat", mode: "track" });
  const loop = ended(state); assert.equal(loop.current.entryId, state.current.entryId);
  assert.deepEqual(loop.userQueue, state.userQueue); assert.equal(loop.history.length, 0);
  assert.equal(next(loop).current.track.id, "X");
});
test("repeat context starts the entire original container after user items", () => {
  let state = apply(begin(["A", "B"], 1), { type: "setRepeat", mode: "context" });
  const prior = state.current.entryId; state = enqueue(state, "X");
  state = ended(state); assert.equal(state.current.track.id, "X");
  state = ended(state); assert.equal(state.current.track.id, "A");
  state = ended(state); assert.equal(state.current.track.id, "B"); assert.notEqual(state.current.entryId, prior); invariant(state);
});
test("shuffle changes only context order and unshuffle restores source order", () => {
  const state = enqueue(begin(Array.from({ length: 12 }, (_, i) => String(i)), 0), "X");
  const mixed = apply(freeze(state), { type: "setShuffle", enabled: true, seed: 12345 });
  assert.equal(mixed.userQueue, state.userQueue); assert.equal(mixed.current, state.current);
  assert.notDeepEqual(ids(mixed.contextQueue), ids(state.contextQueue));
  assert.deepEqual(ids(apply(mixed, { type: "setShuffle", enabled: false, seed: 1 }).contextQueue), ids(state.contextQueue));
});
test("same shuffle seed and action replay produce deterministic state", () => {
  const command = { type: "setShuffle", enabled: true, seed: 587 };
  assert.deepEqual(apply(begin(), command), apply(begin(), command));
});
test("progress and end events for an old occurrence or old load epoch are ignored", () => {
  const state = begin(); const stale = token(state); const advanced = next(state);
  assert.equal(apply(advanced, { type: "progress", token: stale, position: 100 }), advanced);
  assert.equal(apply(advanced, { type: "advance", reason: "ended", token: stale }), advanced);
  const loop = ended(apply(state, { type: "setRepeat", mode: "track" }));
  assert.equal(apply(loop, { type: "advance", reason: "ended", token: stale }), loop);
});
test("a late ended event must not restart music after the user pressed Pause", () => {
  const paused = apply(begin(), { type: "setPlaying", playing: false }); assert.equal(ended(paused), paused);
});
test("seek is bounded and progress updates do not generate another seek command", () => {
  const state = begin(); const seeked = apply(state, { type: "seek", position: 999 }); assert.equal(seeked.position, 240);
  const progressed = apply(seeked, { type: "progress", token: token(seeked), position: 10, duration: 20 });
  assert.equal(progressed.position, 10); assert.equal(progressed.seekRevision, seeked.seekRevision);
  assert.equal(apply(state, { type: "seek", position: -5 }).position, 0);
  assert.equal(apply(state, { type: "seek", position: NaN }), state);
});
test("volume and mute are independent so unmuting restores the configured volume", () => {
  let state = apply(begin(), { type: "setVolume", volume: 0.35 });
  state = apply(state, { type: "setMuted", muted: true }); assert.equal(state.volume, 0.35);
  state = apply(state, { type: "setMuted", muted: false }); assert.equal(state.volume, 0.35);
  assert.equal(apply(state, { type: "setVolume", volume: 7 }).volume, 1);
  assert.equal(apply(state, { type: "setVolume", volume: Infinity }), state);
});
test("stale recommendation responses cannot append to a replacement context", () => {
  const state = begin(); const changed = apply(state, { type: "startContext", tracks: [song("Q")], index: 0, context: { ...context, id: "q" } });
  assert.equal(apply(changed, { type: "appendContext", tracks: [song("R")], contextRevision: state.contextRevision }), changed);
});
test("radio context append deduplicates discovery items, not explicit user entries", () => {
  const state = enqueue(begin(), "C"); const appended = apply(state, { type: "appendContext", tracks: [song("C"), song("E"), song("E")], contextRevision: state.contextRevision });
  assert.deepEqual(ids(appended.contextQueue), ["C", "D", "E"]); assert.deepEqual(ids(appended.userQueue), ["C"]);
});
test("blocked playback stays recoverable and a retry gets a new media epoch", () => {
  const state = begin(); const blocked = apply(state, { type: "mediaStatus", token: token(state), status: "blocked", message: "Tap play" });
  assert.equal(blocked.isPlaying, false); const retried = apply(blocked, { type: "setPlaying", playing: true });
  assert.ok(retried.playbackRevision > blocked.playbackRevision); assert.equal(retried.error, null);
});
test("a stray provider PAUSED event cannot override play intent during loading", () => {
  const state = begin(); assert.equal(apply(state, { type: "mediaStatus", token: token(state), status: "paused" }), state);
});
test("invalid source lists are rejected without selecting the wrong index", () => {
  const state = begin();
  for (const index of [-1, 4, 1.5, NaN]) assert.equal(apply(state, { type: "startContext", tracks: [song("A")], index, context }), state);
  assert.equal(apply(state, { type: "startContext", tracks: [song("A"), null, song("B")], index: 2, context }), state);
  assert.equal(apply(state, { type: "startContext", tracks: [], index: 0, context }), state);
});
test("queue limits fail without deleting existing entries", () => {
  let state = initial("alice"); for (let i = 0; i < MAX_USER_QUEUE; i += 1) state = enqueue(state, "X");
  assert.equal(enqueue(state, "Y"), state);
  assert.equal(apply(state, { type: "startContext", tracks: Array(MAX_CONTEXT_TRACKS + 1).fill(song("A")), index: 0, context }), state);
});
test("unknown commands and unknown queue IDs are harmless", () => {
  const state = begin(); assert.equal(apply(state, { type: "unknown" }), state);
  assert.equal(apply(state, { type: "selectQueued", entryId: "none" }), state);
});
test("normalization excludes raw media URLs, credentials and unsafe navigation targets", () => {
  const normalized = normalizeAudioTrack({ ...song("A"), secret: "secret", src: "https://signed.invalid/audio?token=secret", artistHref: "javascript:alert(1)", albumHref: "/album/a" });
  assert.equal(normalized.secret, undefined); assert.equal(normalized.src, undefined);
  assert.equal(normalized.artistHref, undefined); assert.equal(normalized.albumHref, "/album/a");
  for (const href of ["//evil.invalid", "/\\evil.invalid", "javascript:x", "/\nfoo"]) assert.equal(safeInternalHref(href), undefined);
});
test("account reset discards queues, history and current playback", () => {
  const state = apply(next(enqueue(begin(), "X")), { type: "reset", owner: "bob" });
  assert.equal(state.owner, "bob"); assert.equal(state.current, null);
  assert.deepEqual(state.userQueue, []); assert.deepEqual(state.history, []); assert.equal(state.isPlaying, false);
});
test("Redux-compatible reducer rejects unrelated Redux actions", () => {
  const state = begin(); assert.equal(reducer.default(state, { type: "settings/setTheme", payload: "navy" }), state);
  assert.deepEqual(reducer.default(state, reducer.audioCommand({ type: "clearUserQueue" })), state);
});
for (const seed of [1, 7, 13, 97, 123456]) test(`randomized frozen-state invariants, seed ${seed}`, () => {
  let random = seed; const rnd = (n) => { random = (Math.imul(random, 1664525) + 1013904223) >>> 0; return random % n; };
  let state = begin(["A", "A", "B", "C", "D", "E"], 0);
  for (let step = 0; step < 1000; step += 1) {
    freeze(state); const all = [...state.userQueue, ...state.contextQueue];
    const entry = all.length ? all[rnd(all.length)] : null;
    const action = rnd(10);
    if (action < 2) state = enqueue(state, String(rnd(8)), action === 0 ? "next" : "last");
    else if (action === 2) state = next(state);
    else if (action === 3) state = apply(state, { type: "previous" });
    else if (action === 4) state = apply(state, { type: "clearUserQueue" });
    else if (action === 5) state = apply(state, { type: "setShuffle", enabled: !state.isShuffle, seed: rnd(0xffffff) });
    else if (action === 6 && entry) state = apply(state, { type: "remove", entryId: entry.entryId });
    else if (action === 7 && entry) state = apply(state, { type: "move", entryId: entry.entryId, destination: "user", beforeEntryId: null });
    else if (action === 8) state = apply(state, { type: "seek", position: rnd(600) });
    else if (action === 9 && entry) state = apply(state, { type: "selectQueued", entryId: entry.entryId });
    invariant(state);
  }
});
test("same track IDs from different providers stay separate", () => {
  const id = "aaaaaaaaaaa"; let state = begin([id], 0);
  state = apply(state, { type: "enqueue", track: { ...song(id), provider: "youtube" }, placement: "next" });
  assert.equal(state.current.track.provider, "native"); assert.equal(next(state).current.track.provider, "youtube");
});
test("the same natural-end callback cannot advance twice", () => {
  const state = begin(); const event = { type: "advance", reason: "ended", token: token(state) };
  const advanced = apply(state, event); assert.equal(apply(advanced, event), advanced);
});
test("manual skip ignores repeat-track at the end of a one-track context", () => {
  const state = apply(begin(["A"], 0), { type: "setRepeat", mode: "track" });
  assert.equal(next(state).status, "ended");
});
