import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";

register("./support/toolkit-loader.mjs", import.meta.url);
const { default: reducer, restorePlayback, setYoutubeVideo, setPlaybackPosition, playPause } = await import("../src/redux/features/playerSlice.js");

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