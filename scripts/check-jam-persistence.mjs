import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import JamRoom from "../src/models/JamRoom.js";
import { jamPlaybackPositionMatchesTrack, jamTrackOccurrenceChanged } from "../src/utils/jam.mjs";
import { JAM_SAVED_QUEUE_MAX, sanitizeSavedQueue, sanitizeSavedTrack } from "../src/utils/jamRooms.mjs";
import { normalizePlaybackSnapshot } from "../src/utils/playbackSnapshot.mjs";

const song = { id: "abcdefghijk", title: "Repeated song", channel: "QA", duration: 180 };
// Use the actual reducer with RTK's installed CommonJS entry, as in the existing Node QA checks.
const reducerFile = new URL("../src/redux/features/playerSlice.js", import.meta.url);
const compiled = ts.transpileModule(readFileSync(reducerFile, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const redux = { exports: {} };
new Function("require", "module", "exports", compiled)(createRequire(reducerFile), redux, redux.exports);
const { default: reducer, setYoutubeQueue, setYoutubeVideo, playPause } = redux.exports;

test("saved Jam keeps repeated occurrences, the selected occurrence and user queue after restoration", () => {
  const queue = [
    { ...song, queueEntryId: "context:1:abcdefghijk", queueSource: "context" },
    { ...song, queueEntryId: "context:2:abcdefghijk", queueSource: "context" },
    { ...song, queueEntryId: "user:3:abcdefghijk", queueSource: "user" },
  ];
  // Exercise the real persistence schema and current client normalizer without a database connection.
  const room = new JamRoom({
    code: "ABCDEF", hostId: "qa-host", persistent: true, startedAt: 1,
    expiresAt: new Date(2_000_000_000_000),
    savedQueue: sanitizeSavedQueue(queue), savedTrack: sanitizeSavedTrack(queue[1]),
  });
  assert.equal(room.validateSync(), undefined);
  const saved = JSON.parse(JSON.stringify(room.toObject()));
  const restored = normalizePlaybackSnapshot({ youtubeQueue: saved.savedQueue, youtubeVideo: saved.savedTrack });
  assert.deepEqual(restored.youtubeQueue.map(track => track.queueEntryId), queue.map(track => track.queueEntryId));
  assert.equal(restored.youtubeVideo.queueEntryId, queue[1].queueEntryId);
  assert.equal(restored.userQueue.length, 1);
  assert.equal(restored.userQueue[0].queueEntryId, queue[2].queueEntryId);
  assert.equal(jamTrackOccurrenceChanged(restored.youtubeQueue[0], restored.youtubeVideo), true);
  assert.equal(jamPlaybackPositionMatchesTrack({ videoId: song.id, queueEntryId: queue[0].queueEntryId }, restored.youtubeVideo), false);
  assert.equal(jamPlaybackPositionMatchesTrack({ videoId: song.id, queueEntryId: queue[1].queueEntryId }, restored.youtubeVideo), true);

  // These are the same three actions used by useJamSession.applySync when reopening a saved room.
  let state = reducer(undefined, setYoutubeQueue(saved.savedQueue));
  state = reducer(state, setYoutubeVideo(saved.savedTrack));
  state = reducer(state, playPause(false));
  assert.deepEqual(state.youtubeQueue.map(track => track.queueEntryId), queue.map(track => track.queueEntryId));
  assert.equal(state.youtubeVideo.queueEntryId, queue[1].queueEntryId);
  assert.equal(state.userQueue.length, 1);
  assert.equal(state.userQueue[0].queueEntryId, queue[2].queueEntryId);
  assert.equal(state.isPlaying, false);
});

test("a duplicate occurrence is stored once while another occurrence of the same song survives", () => {
  const first = { ...song, queueEntryId: "first" };
  assert.deepEqual(sanitizeSavedQueue([first, first, { ...song, queueEntryId: "second" }])
    .map(track => track.queueEntryId), ["first", "second"]);
});

test("legacy song identities and occurrence identities do not collide", () => {
  const saved = sanitizeSavedQueue([song, song, { ...song, queueEntryId: song.id }]);
  assert.equal(saved.length, 2);
  assert.equal(Object.hasOwn(saved[0], "queueEntryId"), false);
  assert.equal(saved[1].queueEntryId, song.id);
});

test("invalid occurrence metadata keeps legacy behavior and bounded strings match the client contract", () => {
  for (const queueEntryId of [null, 42, {}, [], "  "]) {
    const invalid = { ...song, queueEntryId, queueSource: "invalid" };
    const saved = sanitizeSavedQueue([invalid, invalid]);
    assert.equal(saved.length, 1);
    assert.equal(Object.hasOwn(saved[0], "queueEntryId"), false);
    assert.equal(Object.hasOwn(saved[0], "queueSource"), false);
  }
  assert.equal(sanitizeSavedTrack({ ...song, queueEntryId: "  occurrence  " }).queueEntryId, "occurrence");
  assert.equal(sanitizeSavedTrack({ ...song, queueEntryId: "x".repeat(10_000) }).queueEntryId.length, 220);
});

test("saved tracks retain only public track and queue fields", () => {
  const saved = sanitizeSavedTrack({
    ...song, queueEntryId: "occurrence", queueSource: "user",
    asset: { url: "https://example.test/private-stream" }, receipt: "private-receipt", authorization: "private-token",
  });
  assert.equal(saved.queueEntryId, "occurrence");
  assert.equal(saved.queueSource, "user");
  for (const key of ["asset", "receipt", "authorization"]) assert.equal(Object.hasOwn(saved, key), false);
});

test("repeated songs still respect the persistent room queue limit", () => {
  const queue = Array.from({ length: JAM_SAVED_QUEUE_MAX + 10 }, (_, index) => ({ ...song, queueEntryId: `occurrence:${index}` }));
  const saved = sanitizeSavedQueue([{ id: "invalid" }, ...queue]);
  assert.equal(saved.length, JAM_SAVED_QUEUE_MAX);
  assert.equal(saved.at(-1).queueEntryId, `occurrence:${JAM_SAVED_QUEUE_MAX - 1}`);
});
