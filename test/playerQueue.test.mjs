import test from "node:test";
import assert from "node:assert/strict";
import { nextQueueTrack, shuffleUpcoming } from "../src/utils/playerQueue.mjs";

test("shuffle preserves played/current tracks and queue members without mutation", () => {
  const queue = ["past", "current", "next", "last"].map((id) => ({ id }));
  assert.deepEqual(shuffleUpcoming(queue, "current", () => 0).map((track) => track.id), ["past", "current", "last", "next"]);
  assert.deepEqual(queue.map((track) => track.id), ["past", "current", "next", "last"]);
});

test("repeat wraps including a single track; off leaves continuation to the engine", () => {
  const queue = [{ id: "first" }, { id: "last" }];
  assert.equal(nextQueueTrack(queue, "first", true), queue[1]);
  assert.equal(nextQueueTrack(queue, "last", true), queue[0]);
  assert.equal(nextQueueTrack(queue, "last", false), null);
  assert.equal(nextQueueTrack([queue[0]], "first", true), queue[0]);
  assert.equal(nextQueueTrack([], "missing", true), null);
});