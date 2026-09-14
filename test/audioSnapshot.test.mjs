import test from "node:test";
import assert from "node:assert/strict";
import { loadAudioModules } from "./helpers/loadAudioModules.mjs";
const { session, snapshot, reducer } = loadAudioModules();
const { createAudioSession: initial, reduceAudioSession: apply } = session;
const { writeAudioSnapshot: write, readAudioSnapshot: read, normalizeAudioSnapshot: normalize,
  AUDIO_SNAPSHOT_PREFIX: prefix, AUDIO_SNAPSHOT_MAX_AGE: maxAge, AUDIO_SNAPSHOT_MAX_BYTES: maxBytes } = snapshot;
const now = 1800000000000;
const song = (id) => ({ id, provider: "native", title: id, artist: "Artist", duration: 240, albumHref: "/album/a" });
function state() {
  let current = apply(initial("alice"), { type: "startContext", tracks: ["A", "B", "C", "D"].map(song), index: 1,
    context: { id: "p", name: "Night Drive", type: "playlist", href: "/library/playlist/p" } });
  current = apply(current, { type: "enqueue", track: song("B"), placement: "next" });
  current = apply(current, { type: "enqueue", track: song("B"), placement: "last" });
  current = apply(current, { type: "advance", reason: "skip" });
  current = apply(current, { type: "setVolume", volume: 0.37 });
  current = apply(current, { type: "setMuted", muted: true });
  current = apply(current, { type: "setShuffle", enabled: true, seed: 27 });
  current = apply(current, { type: "setRepeat", mode: "context" });
  return apply(current, { type: "seek", position: 52.5 });
}
function storage() {
  const values = new Map();
  return { getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, value), values };
}
const key = (owner = "alice") => `${prefix}${encodeURIComponent(owner)}`;
const envelope = (value, owner = "alice", savedAt = now) => JSON.stringify({ version: 2, owner, savedAt, session: value });

test("roundtrip restores complete session, queues, context, history, volume and modes", () => {
  const db = storage(); const before = state(); assert.equal(write(db, "alice", before, now), true);
  const restored = read(db, "alice", now + 1000);
  assert.deepEqual(restored, { ...before, isPlaying: false, status: "paused", error: null });
});
test("restore never requests audible autoplay", () => {
  const db = storage(); write(db, "alice", state(), now);
  const restored = read(db, "alice", now); assert.equal(restored.isPlaying, false); assert.equal(restored.status, "paused");
});
test("duplicates preserve independent occurrence IDs after refresh", () => {
  const db = storage(); const before = state(); write(db, "alice", before, now);
  const restored = read(db, "alice", now);
  assert.equal(restored.current.track.id, restored.userQueue[0].track.id);
  assert.notEqual(restored.current.entryId, restored.userQueue[0].entryId);
});
test("account-scoped keys cannot leak Alice's queue to Bob", () => {
  const db = storage(); write(db, "alice", state(), now);
  assert.equal(read(db, "bob", now), null);
  db.setItem(key("bob"), db.getItem(key())); assert.equal(read(db, "bob", now), null);
});
test("writing under the wrong owner is rejected", () => {
  const db = storage(); assert.equal(write(db, "bob", state(), now), false); assert.equal(db.values.size, 0);
});
test("anonymous or unresolved owners do not read or persist another session", () => {
  const db = storage(); for (const owner of [null, "", " "]) {
    assert.equal(write(db, owner, state(), now), false); assert.equal(read(db, owner, now), null);
  }
});
test("private sessions and live Jam do not access snapshot storage", () => {
  let calls = 0; const db = { getItem: () => { calls += 1; return null; }, setItem: () => { calls += 1; } };
  for (const policy of [{ privateSession: true }, { inJam: true }]) {
    assert.equal(read(db, "alice", now, policy), null); assert.equal(write(db, "alice", state(), now, policy), false);
  }
  assert.equal(calls, 0);
});
test("blocked storage and quota errors are non-fatal", () => {
  const db = { getItem: () => { throw new Error("disabled"); }, setItem: () => { throw new Error("QuotaExceededError"); } };
  assert.equal(read(db, "alice", now), null); assert.equal(write(db, "alice", state(), now), false);
  assert.equal(read(undefined, "alice", now), null); assert.equal(write(undefined, "alice", state(), now), false);
});
test("expired and future-dated snapshots are rejected", () => {
  const db = storage(); db.setItem(key(), envelope(state(), "alice", now - maxAge - 1)); assert.equal(read(db, "alice", now), null);
  db.setItem(key(), envelope(state(), "alice", now + 1)); assert.equal(read(db, "alice", now), null);
});
test("snapshot age at the boundary is still valid", () => {
  const db = storage(); db.setItem(key(), envelope(state(), "alice", now - maxAge)); assert.ok(read(db, "alice", now));
});
test("unsupported versions, invalid JSON and oversized bytes are rejected", () => {
  const db = storage(); for (const raw of ["{", "null", '{"version":99}', "x".repeat(maxBytes + 1)]) {
    db.setItem(key(), raw); assert.equal(read(db, "alice", now), null);
  }
});
test("malformed current track, queue structure and duplicate occurrence IDs are rejected", () => {
  const before = state(); const variants = [
    { ...before, current: { ...before.current, track: { id: "" } } },
    { ...before, userQueue: "not-an-array" },
    { ...before, history: [before.current] },
    { ...before, contextQueue: [...before.contextQueue, before.contextQueue[0]] },
    { ...before, userQueue: [{ ...before.userQueue[0], origin: "context" }] },
  ];
  for (const value of variants) assert.equal(normalize(value, "alice"), null);
});
test("unknown persisted fields are dropped rather than spread into state", () => {
  const normalized = normalize({ ...state(), token: "secret", unexpectedStore: { admin: true } }, "alice");
  assert.ok(normalized); assert.equal(normalized.token, undefined); assert.equal(normalized.unexpectedStore, undefined);
});
test("invalid scalar settings and counters are rejected", () => {
  for (const invalid of [{ volume: -1 }, { volume: 2 }, { volume: NaN }, { isMuted: "false" }, { repeatMode: "everything" },
    { position: Infinity }, { sequence: -1 }, { shuffleSeed: 2 ** 40 }, { playbackRevision: 1.5 }, { duration: -1 }]) {
    assert.equal(normalize({ ...state(), ...invalid }, "alice"), null);
  }
});
test("restoration repairs an allocator behind existing occurrence IDs", () => {
  const restored = normalize({ ...state(), sequence: 0 }, "alice"); assert.ok(restored.sequence >= 6);
  const next = apply(restored, { type: "enqueue", track: song("Z"), placement: "last" });
  const entries = [next.current, ...next.userQueue, ...next.contextQueue, ...next.history];
  assert.equal(new Set(entries.map((entry) => entry.entryId)).size, entries.length);
});
test("context queue entries must match their original container index", () => {
  const before = state(); const changed = { ...before, contextQueue: before.contextQueue.map((entry, index) => index ? entry : { ...entry, contextIndex: 0 }) };
  assert.equal(normalize(changed, "alice"), null);
});
test("legacy v1 snapshot migrates as unknown source, not invented playlist/user intent", () => {
  const db = storage(); const a = { id: "aaaaaaaaaaa", title: "A", channel: "Artist" }; const b = { id: "bbbbbbbbbbb", title: "B" };
  db.setItem("heykasa:playback:v1:alice", JSON.stringify({ version: 1, owner: "alice", savedAt: now, youtubeVideo: a, youtubeQueue: [a, b], position: 37 }));
  const restored = read(db, "alice", now); assert.equal(restored.current.track.id, a.id); assert.equal(restored.position, 37);
  assert.equal(restored.context.source.type, "unknown"); assert.deepEqual(restored.userQueue, []);
  assert.equal(restored.contextQueue[0].track.id, b.id);
});
test("legacy selected track missing from its queue is retained", () => {
  const db = storage(); db.setItem("heykasa:playback:v1:alice", JSON.stringify({ version: 1, owner: "alice", savedAt: now,
    youtubeVideo: { id: "aaaaaaaaaaa", title: "A" }, youtubeQueue: [{ id: "bbbbbbbbbbb", title: "B" }], position: 12 }));
  assert.equal(read(db, "alice", now).contextQueue[0].track.id, "bbbbbbbbbbb");
});
test("a corrupt v2 snapshot does not resurrect an older v1 session", () => {
  const db = storage(); db.setItem(key(), "corrupt"); db.setItem("heykasa:playback:v1:alice", JSON.stringify({ version: 1, owner: "alice", savedAt: now, youtubeVideo: { id: "aaaaaaaaaaa" } }));
  assert.equal(read(db, "alice", now), null);
});
test("hydration uses a new playback revision even for an identical restored entry", () => {
  const before = state(); const restored = reducer.default(before, reducer.restoreAudioSession("alice", before));
  assert.equal(restored.playbackRevision, before.playbackRevision + 1); assert.equal(restored.isPlaying, false);
});
test("hydrating another owner cannot import a mismatched snapshot", () => {
  const restored = reducer.default(state(), reducer.restoreAudioSession("bob", state()));
  assert.equal(restored.owner, "bob"); assert.equal(restored.current, null); assert.equal(restored.isPlaying, false);
});
test("a completed session can restore with its last artwork and no pending tracks", () => {
  let before = state(); before = apply(before, { type: "setRepeat", mode: "off" });
  while (before.userQueue.length || before.contextQueue.length) before = apply(before, { type: "advance", reason: "skip" });
  const db = storage(); assert.equal(write(db, "alice", before, now), true); assert.ok(read(db, "alice", now).current);
});
test("malformed hydration payloads are harmless Redux actions", () => {
  const before = state();
  for (const payload of [undefined, null, false, {}, { owner: null }, { owner: " " }]) {
    assert.equal(reducer.default(before, { type: reducer.AUDIO_RESTORE, payload }), before);
  }
  assert.equal(reducer.default(before, { type: reducer.AUDIO_COMMAND, payload: null }), before);
});
test("context provenance cannot be detached from its saved container", () => {
  assert.equal(normalize({ ...state(), context: null }, "alice"), null);
});
