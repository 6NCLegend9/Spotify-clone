import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
import { canonicalSongIdentity, canonicalSongTitle } from "../src/utils/songIdentity.mjs";

register("./support/toolkit-loader.mjs", import.meta.url);
const {
  default: reducer,
  appendToQueue,
  startYoutubePlayback,
} = await import("../src/redux/features/playerSlice.js");

const seed = {
  id: "seedtrack01",
  title: "Don Toliver - Lose My Mind (feat. Doja Cat) [From F1 The Movie] [Official Music Video]",
  channel: "Don Toliver",
};

const variants = [
  { id: "variant0001", title: "Lose My Mind (feat. Doja Cat)", channel: "Don Toliver - Topic" },
  { id: "variant0002", title: "Don Toliver - Lose My Mind (feat. Doja Cat) [From F1 The Movie] [Official Audio]", channel: "F1 The Album" },
  { id: "variant0003", title: "Lose My Mind Ft. Doja Cat – Don Toliver (Official Movie Version) | F1: The Movie", channel: "Kick It To The King Productions" },
  { id: "variant0004", title: "Don Toliver - Lose My Mind (Official Visualizer)", channel: "Don Toliver" },
];

test("canonical song identity collapses alternate uploads of the same recording", () => {
  assert.equal(canonicalSongTitle(seed), "lose my mind");
  assert.equal(canonicalSongIdentity(seed), "don toliver|lose my mind");
  variants.forEach((track) => {
    assert.equal(canonicalSongTitle(track), "lose my mind");
    assert.equal(canonicalSongIdentity(track), "don toliver|lose my mind");
  });
});

test("radio auto-extension rejects alternate uploads but keeps different artists with the same title", () => {
  let state = reducer(undefined, startYoutubePlayback({ track: seed, queue: [seed] }));
  state = reducer(state, appendToQueue([
    ...variants,
    { id: "othertrack1", title: "Don Toliver - No Idea (Official Music Video)", channel: "Don Toliver" },
    { id: "othertrack2", title: "After Party", channel: "Don Toliver - Topic" },
    { id: "othertrack3", title: "Brett Eldredge - Lose My Mind (Official Music Video)", channel: "Brett Eldredge" },
    { id: "othertrack4", title: "PARTYNEXTDOOR - LOSE MY MIND (Official Visualizer)", channel: "PARTYNEXTDOOR" },
  ]));

  assert.deepEqual(
    state.youtubeQueue.map((track) => canonicalSongIdentity(track)),
    [
      "don toliver|lose my mind",
      "don toliver|no idea",
      "don toliver|after party",
      "brett eldredge|lose my mind",
      "partynextdoor|lose my mind",
    ],
  );
  assert.equal(state.queueManualEnd, false);
});

test("finite playlist queues keep explicit order even when titles repeat", () => {
  let state = reducer(undefined, startYoutubePlayback({
    track: seed,
    queue: [seed],
    autoExtend: false,
  }));
  state = reducer(state, appendToQueue([
    { id: "othertrack3", title: "Brett Eldredge - Lose My Mind (Official Music Video)", channel: "Brett Eldredge" },
  ]));

  assert.equal(state.youtubeQueue.length, 2);
  assert.equal(state.queueManualEnd, true);
});
