import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";

register("./support/toolkit-loader.mjs", import.meta.url);
const {
  default: reducer,
  restorePlayback,
  setYoutubeVideo,
  setPlaybackPosition,
  playPause,
  editQueue,
  undoQueueEdit,
  addToQueue,
  playNextToQueue,
  startYoutubePlayback,
} = await import("../src/redux/features/playerSlice.js");

const track = { id: "abcdefghijk", title: "Track" };

test("restoration clears the previous account and never starts playback", () => {
  let state = reducer(undefined, setYoutubeVideo(track));
  state = reducer(state, playPause(true));
  state = reducer(state, restorePlayback({ owner: "account-b", snapshot: { youtubeVideo: track, youtubeQueue: [track], position: 42 } }));
  assert.equal(state.isPlaying, false);
  assert.equal(state.restorePosition, 42);
  assert.equal(state.playbackOwner, "account-b");
  state = reducer(state, restorePlayback({ owner: "guest", snapshot: null }));
  assert.equal(state.youtubeVideo, null);
  assert.deepEqual(state.youtubeQueue, []);
});

test("progress from an old track is ignored and selection clears restore position", () => {
  let state = reducer(undefined, restorePlayback({ owner: "guest", snapshot: { youtubeVideo: track, position: 42 } }));
  state = reducer(state, setPlaybackPosition({ id: "oldtrack123", position: 100 }));
  assert.equal(state.position, 42);
  state = reducer(state, setPlaybackPosition({ id: track.id, position: 50 }));
  assert.equal(state.position, 50);
  state = reducer(state, setYoutubeVideo(track));
  assert.equal(state.restorePosition, null);
  assert.equal(state.position, 0);
  assert.equal(state.isPlaying, true);
});

test("upcoming edits preserve the current track and explicit collection mode", () => {
  const second = { id: "lmnopqrstuv", title: "Second" };
  const third = { id: "12345678901", title: "Third" };
  let state = reducer(undefined, restorePlayback({ owner: "guest", snapshot: {
    youtubeVideo: track,
    youtubeQueue: [track, second, third],
    position: 42,
    queueMode: "collection",
    playbackContext: { type: "playlist", id: "p1", name: "Playlist" },
  } }));
  state = reducer(state, editQueue({ kind: "remove", id: track.id, now: 100 }));
  assert.equal(state.youtubeQueue.length, 3);
  state = reducer(state, editQueue({ kind: "move", id: third.id, direction: -1, now: 100 }));
  assert.deepEqual(state.youtubeQueue.map((item) => item.id), [track.id, third.id, second.id]);
  assert.equal(state.position, 42);
  assert.equal(state.isPlaying, false);
  state = reducer(state, undoQueueEdit({ now: 200 }));
  assert.deepEqual(state.youtubeQueue.map((item) => item.id), [track.id, second.id, third.id]);
  state = reducer(state, editQueue({ kind: "clear", now: 300 }));
  assert.equal(state.queueMode, "collection");
  assert.equal(state.queueManualEnd, true);
  assert.deepEqual(state.youtubeQueue.map((item) => item.id), [track.id]);
  state = reducer(state, undoQueueEdit({ now: 10_300 }));
  assert.equal(state.youtubeQueue.length, 1);
  state = reducer(state, addToQueue(second));
  assert.equal(state.queueMode, "collection");
  assert.equal(state.userQueue.length, 1);
  state = reducer(state, editQueue({ kind: "remove", index: 1, now: 20_000 }));
  state = reducer(state, addToQueue(third));
  state = reducer(state, undoQueueEdit({ now: 20_001 }));
  assert.deepEqual(state.youtubeQueue.map((item) => item.id), [track.id, third.id]);
});

test("explicit user queue allows duplicate occurrences and Play Next keeps priority", () => {
  const second = { id: "lmnopqrstuv", title: "Second" };
  let state = reducer(undefined, startYoutubePlayback({
    queue: [track],
    track,
    queueMode: "radio",
    context: { type: "radio", id: track.id, name: "Track radio" },
  }));
  state = reducer(state, addToQueue(second));
  state = reducer(state, addToQueue(second));
  assert.equal(state.userQueue.length, 2);
  assert.notEqual(state.userQueue[0].queueEntryId, state.userQueue[1].queueEntryId);
  state = reducer(state, playNextToQueue({ id: "12345678901", title: "Urgent" }));
  assert.equal(state.youtubeQueue[1].title, "Urgent");
  assert.equal(state.userQueue[0].title, "Urgent");
});

test("track changes build a bounded previous-track history", () => {
  const second = { id: "lmnopqrstuv", title: "Second" };
  let state = reducer(undefined, startYoutubePlayback({ queue: [track, second], track, queueMode: "collection" }));
  const secondOccurrence = state.youtubeQueue[1];
  state = reducer(state, setYoutubeVideo(secondOccurrence));
  assert.equal(state.history.length, 1);
  assert.equal(state.history[0].id, track.id);
});
