import assert from "node:assert/strict";
import test from "node:test";
import { readPlaybackSnapshot, writePlaybackSnapshot, normalizePlaybackSnapshot } from "../src/utils/playbackSnapshot.mjs";

const track = { id: "abcdefghijk", title: "Track", channel: "Artist", seedQuery: "Artist Track", genre: "R&B", source: "youtube" };
function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test("snapshots restore playback context, queue mode and safe metadata without leaking arbitrary fields", () => {
  const storage = memoryStorage();
  writePlaybackSnapshot(storage, "account-a", {
    youtubeVideo: { ...track, token: "secret", queueEntryId: "context:1:abcdefghijk", queueSource: "context" },
    youtubeQueue: [{ ...track, queueEntryId: "context:1:abcdefghijk", queueSource: "context" }],
    userQueue: [],
    history: [],
    position: 42,
    queueMode: "radio",
    playbackContext: { type: "radio", id: track.id, name: "Track radio" },
  });
  assert.equal(readPlaybackSnapshot(storage, "account-b"), null);
  assert.equal(readPlaybackSnapshot(storage, "guest"), null);
  const restored = readPlaybackSnapshot(storage, "account-a");
  assert.equal(restored.youtubeVideo.id, track.id);
  assert.equal(restored.youtubeVideo.seedQuery, "Artist Track");
  assert.equal(restored.youtubeVideo.genre, "R&B");
  assert.equal(restored.position, 42);
  assert.equal(restored.queueMode, "radio");
  assert.equal(restored.queueManualEnd, false);
  assert.equal(restored.playbackContext.type, "radio");
  assert.equal(restored.youtubeVideo.token, undefined);
  assert.equal(restored.isPlaying, undefined);
});

test("snapshots preserve intentional duplicate occurrences and bound position and size", () => {
  const duplicateOne = { ...track, queueEntryId: "user:1:abcdefghijk", queueSource: "user" };
  const duplicateTwo = { ...track, queueEntryId: "user:2:abcdefghijk", queueSource: "user" };
  const snapshot = normalizePlaybackSnapshot({
    youtubeVideo: duplicateOne,
    youtubeQueue: [duplicateOne, duplicateTwo, { id: "invalid" }, ...Array.from({ length: 250 }, (_, index) => ({ id: String(index).padStart(11, "0") }))],
    userQueue: [duplicateTwo],
    position: -100,
    queueMode: "collection",
  });
  assert.equal(snapshot.youtubeQueue.length, 200);
  assert.equal(snapshot.position, 0);
  assert.equal(snapshot.queueMode, "collection");
  assert.equal(snapshot.queueManualEnd, true);
  assert.equal(snapshot.youtubeQueue.filter((item) => item.id === track.id).length, 2);
  assert.notEqual(snapshot.youtubeQueue[0].queueEntryId, snapshot.youtubeQueue[1].queueEntryId);
  assert.equal(snapshot.userQueue.length, 1);
  assert.equal(normalizePlaybackSnapshot({ youtubeVideo: { id: {} }, youtubeQueue: null }).youtubeVideo, null);
});

test("version 1 snapshots migrate conservatively without turning collections into radio", () => {
  const storage = memoryStorage();
  const owner = "account-a";
  storage.setItem(`heykasa:playback:v1:${encodeURIComponent(owner)}`, JSON.stringify({
    version: 1,
    owner,
    savedAt: Date.now(),
    youtubeVideo: track,
    youtubeQueue: [track, { id: "lmnopqrstuv", title: "Next", channel: "Artist" }],
    position: 10,
  }));
  const restored = readPlaybackSnapshot(storage, owner);
  assert.equal(restored.queueMode, "collection");
  assert.equal(restored.queueManualEnd, true);
});

test("missing, corrupt, expired and unavailable storage are nonfatal", () => {
  assert.equal(readPlaybackSnapshot({ getItem: () => "{" }, "account-a"), null);
  assert.equal(readPlaybackSnapshot({ getItem: () => JSON.stringify({ version: 99 }) }, "account-a"), null);
  const unavailable = { getItem() { throw new Error("Blocked"); }, setItem() { throw new Error("Quota"); } };
  assert.equal(readPlaybackSnapshot(unavailable, "account-a"), null);
  assert.equal(writePlaybackSnapshot(unavailable, "account-a", {}), false);
  const storage = memoryStorage();
  writePlaybackSnapshot(storage, "account-a", { youtubeVideo: track }, 1);
  assert.equal(readPlaybackSnapshot(storage, "account-a", 32 * 86400000), null);
});
