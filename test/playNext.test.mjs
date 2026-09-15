import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
register("./support/toolkit-loader.mjs", import.meta.url);
const { default: reducer, startYoutubePlayback, playNextToQueue, playPause } = await import("../src/redux/features/playerSlice.js");
const tracks = Object.fromEntries(["A", "B", "C", "D"].map((id) => [id, { id, title: id }]));
for (const [name, queue, current, selected, expected] of [
  ["moves an earlier track immediately after current", "ABC", "B", "A", "BAC"],
  ["moves a later track immediately after current", "ABCD", "A", "D", "ADBC"],
  ["keeps an already-next track next", "ABC", "A", "B", "ABC"],
  ["adds a new track after current", "ABC", "B", "D", "ABDC"],
  ["does not move the currently playing track", "ABC", "B", "B", "ABC"],
]) {
  test(`Play next ${name}`, () => {
    let state = reducer(undefined, startYoutubePlayback({ track: tracks[current], queue: [...queue].map((id) => tracks[id]) }));
    state = reducer(state, playPause(false));
    state = reducer(state, playNextToQueue(tracks[selected]));
    assert.equal(state.youtubeQueue.map((item) => item.id).join(""), expected);
    assert.equal(state.youtubeVideo.id, current);
    assert.equal(state.isPlaying, false);
  });
}
test("Play next on an empty queue inserts once and ignores invalid tracks", () => {
  let state = reducer(undefined, playNextToQueue(tracks.A));
  const firstEntryId = state.youtubeQueue[0]?.queueEntryId;
  state = reducer(state, playNextToQueue(tracks.A));
  state = reducer(state, playNextToQueue(null));
  assert.deepEqual(state.youtubeQueue.map((item) => item.id), [tracks.A.id]);
  assert.equal(state.youtubeQueue[0].queueSource, "user");
  assert.equal(state.youtubeQueue[0].queueEntryId, firstEntryId);
});
