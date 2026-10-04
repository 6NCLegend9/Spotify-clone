import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";

register("./support/toolkit-loader.mjs", import.meta.url);
const { playHomeTracks } = await import("../src/utils/playHome.js");
const {
  default: reducer,
  editQueue,
  startYoutubePlayback,
  undoQueueEdit,
} = await import("../src/redux/features/playerSlice.js");
const { normalizePlaybackSnapshot } = await import("../src/utils/playbackSnapshot.mjs");

const tracks = [
  { id: "abcdefghijk", title: "First track", channel: "Artist A", source: "youtube" },
  { id: "lmnopqrstuv", title: "Selected track", channel: "Artist B", source: "youtube" },
  { id: "12345678901", title: "Next known track", channel: "Artist C", source: "youtube" },
];

function playbackPayload(startIndex = 0, options = {}) {
  const actions = [];
  playHomeTracks((action) => actions.push(action), tracks, startIndex, options);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].type, "player/startYoutubePlayback");
  return actions[0].payload;
}

test("home track playback keeps the remaining shelf as a continuing radio queue", () => {
  const payload = playbackPayload(1);

  assert.equal(payload.track.id, tracks[1].id);
  assert.equal(payload.queueMode, "radio");
  assert.notEqual(payload.autoExtend, false);
  assert.deepEqual(payload.queue.map((track) => track.id), [tracks[1].id, tracks[2].id]);
});

test("home playlist keeps collection order and explicitly enables continuation", () => {
  const context = { type: "playlist", id: "home-mix", name: "Home Mix" };
  const payload = playbackPayload(1, {
    queueMode: "collection",
    autoExtend: true,
    context,
    playlistId: "home-mix",
    playlistName: "Home Mix",
  });

  assert.equal(payload.queueMode, "collection");
  assert.equal(payload.autoExtend, true);
  assert.equal(payload.track.id, tracks[1].id);
  assert.equal(payload.index, 1);
  assert.deepEqual(payload.context, context);
  assert.deepEqual(payload.queue.map((track) => track.id), tracks.map((track) => track.id));
});

test("collection playback can auto-extend without becoming a radio queue", () => {
  let state = reducer(undefined, startYoutubePlayback({
    queue: tracks,
    track: tracks[0],
    queueMode: "collection",
    autoExtend: true,
    context: { type: "playlist", id: "home-mix", name: "Home Mix" },
  }));

  assert.equal(state.queueMode, "collection");
  assert.equal(state.queueManualEnd, false);

  state = reducer(state, editQueue({
    kind: "move",
    id: state.youtubeQueue[2].queueEntryId,
    direction: -1,
    now: 100,
  }));
  assert.equal(state.queueManualEnd, false);

  state = reducer(state, undoQueueEdit({ now: 101 }));
  assert.equal(state.queueManualEnd, false);
});

test("playback restore preserves collection continuation policy", () => {
  const snapshot = normalizePlaybackSnapshot({
    youtubeVideo: tracks[0],
    youtubeQueue: tracks,
    queueMode: "collection",
    queueManualEnd: false,
  });

  assert.equal(snapshot.queueMode, "collection");
  assert.equal(snapshot.queueManualEnd, false);
});
