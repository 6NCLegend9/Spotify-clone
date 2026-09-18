import assert from "node:assert/strict";
import test from "node:test";
import {
  JAM_ROOM_PRESETS,
  isJamRoomName,
  jamRoomNameKey,
  normalizeJamRoomName,
  persistentRoomExpiry,
  sanitizeArcadeScore,
  sanitizeSavedQueue,
  sanitizeSavedTrack,
  summarizePersistentRoom,
} from "../src/utils/jamRooms.mjs";

test("named rooms normalize and reject one-shot codes as names", () => {
  assert.deepEqual(JAM_ROOM_PRESETS, ["Late night", "Study"]);
  assert.equal(normalizeJamRoomName("  Late   night  "), "Late night");
  assert.equal(jamRoomNameKey("Late Night"), "late night");
  assert.equal(isJamRoomName("Study"), true);
  assert.equal(isJamRoomName("x"), false);
  assert.ok(persistentRoomExpiry(0).getTime() > 30_000);
});

test("saved queues keep unique youtube tracks only", () => {
  assert.equal(sanitizeSavedTrack({ id: "short" }), null);
  const track = sanitizeSavedTrack({
    id: "abcdefghijk",
    title: "  Song  ",
    channel: "Artist",
    thumbnail: "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg",
    duration: 200,
  });
  assert.equal(track.id, "abcdefghijk");
  const queue = sanitizeSavedQueue([track, track, { id: "nope" }, { ...track, id: "lmnopqrstuv" }]);
  assert.equal(queue.length, 2);
  assert.equal(summarizePersistentRoom({
    name: "Study",
    code: "ABC234",
    closed: true,
    savedTrack: track,
    savedQueue: queue,
  }).songs, 2);
});

test("arcade scores clamp and keep known games", () => {
  const score = sanitizeArcadeScore({ score: 99_999_999, game: "hack", name: "  Alex  ", trackTitle: "Song" });
  assert.equal(score.score, 9_999_999);
  assert.equal(score.game, "tiles");
  assert.equal(score.name, "Alex");
});
