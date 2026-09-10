import assert from "node:assert/strict";
import test from "node:test";
import { readPlaybackSnapshot, writePlaybackSnapshot, normalizePlaybackSnapshot } from "../src/utils/playbackSnapshot.mjs";

const track = { id: "abcdefghijk", title: "Track", channel: "Artist" };
function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test("snapshots restore queue metadata only and remain isolated by owner", () => {
  const storage = memoryStorage();
  writePlaybackSnapshot(storage, "account-a", { youtubeVideo: { ...track, token: "secret" }, youtubeQueue: [track], position: 42 });
  assert.equal(readPlaybackSnapshot(storage, "account-b"), null);
  assert.equal(readPlaybackSnapshot(storage, "guest"), null);
  const restored = readPlaybackSnapshot(storage, "account-a");
  assert.equal(restored.youtubeVideo.id, track.id);
  assert.equal(restored.position, 42);
  assert.equal(restored.youtubeVideo.token, undefined);
  assert.equal(restored.isPlaying, undefined);
});

test("snapshots reject invalid IDs, deduplicate queues and bound position and size", () => {
  const snapshot = normalizePlaybackSnapshot({
    youtubeVideo: track,
    youtubeQueue: [track, track, { id: "invalid" }, ...Array.from({ length: 250 }, (_, index) => ({ id: String(index).padStart(11, "0") }))],
    position: -100,
  });
  assert.equal(snapshot.youtubeQueue.length, 200);
  assert.equal(snapshot.position, 0);
  assert.equal(snapshot.youtubeQueue.filter((item) => item.id === track.id).length, 1);
  assert.equal(normalizePlaybackSnapshot({ youtubeVideo: { id: {} }, youtubeQueue: null }).youtubeVideo, null);
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