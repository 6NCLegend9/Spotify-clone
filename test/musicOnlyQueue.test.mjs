import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./support/toolkit-loader.mjs", import.meta.url);

const { default: reducer, addToQueue, appendToQueue, restorePlayback, startYoutubePlayback } = await import("../src/redux/features/playerSlice.js");

const song = { id: "abcdefghijk", title: "BigXthaPlug - 6WA (Official Visualizer)", channel: "BigXthaPlug", seedQuery: "6wa" };
const reaction = { id: "lmnopqrstuv", title: "Rapper Reacts To BigXthaPlug - 6WA", channel: "Reaction Channel", seedQuery: "6wa" };
const press = { id: "mnopqrstuvw", title: "6WA Press Conference | Official Mixtape Announcement", channel: "BigXthaPlug", seedQuery: "6wa" };

test("startYoutubePlayback drops non-music candidates from the queue", () => {
  const state = reducer(undefined, startYoutubePlayback({ queue: [song, reaction, press], track: song, queueMode: "radio" }));
  assert.equal(state.youtubeVideo.id, song.id);
  assert.deepEqual(state.youtubeQueue.map((item) => item.id), [song.id]);
});

test("queue mutations cannot reintroduce reaction or editorial videos", () => {
  let state = reducer(undefined, startYoutubePlayback({ queue: [song], track: song, queueMode: "radio" }));
  state = reducer(state, appendToQueue([reaction, press]));
  state = reducer(state, addToQueue(reaction));
  assert.deepEqual(state.youtubeQueue.map((item) => item.id), [song.id]);
});

test("restored playback purges non-music rows from an older persisted queue", () => {
  const state = reducer(undefined, restorePlayback({
    snapshot: {
      youtubeVideo: song,
      youtubeQueue: [song, reaction, press],
      history: [reaction, song],
      isPlaying: true,
      queueMode: "radio",
    },
    owner: "account",
  }));
  assert.equal(state.youtubeVideo.id, song.id);
  assert.deepEqual(state.youtubeQueue.map((item) => item.id), [song.id]);
  assert.deepEqual(state.history.map((item) => item.id), [song.id]);
});
