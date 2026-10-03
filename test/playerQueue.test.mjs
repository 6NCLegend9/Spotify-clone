import test from "node:test";
import assert from "node:assert/strict";
import * as playerQueue from "../src/utils/playerQueue.mjs";
const { nextQueueTrack, queueAdvanceDecision, queueEntryIdentity, queueTrackIndex, shuffleUpcoming } = playerQueue;

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

test("duplicate video IDs advance by queue occurrence instead of restarting the first copy", () => {
  const first = { id: "same-track1", queueEntryId: "context:1:same-track1" };
  const second = { id: "same-track1", queueEntryId: "user:2:same-track1" };
  const third = { id: "othertrack1", queueEntryId: "context:3:othertrack1" };
  const queue = [first, second, third];

  assert.equal(queueEntryIdentity(first), first.queueEntryId);
  assert.equal(queueTrackIndex(queue, second), 1);
  assert.equal(nextQueueTrack(queue, queueEntryIdentity(first)), second);
  assert.equal(nextQueueTrack(queue, queueEntryIdentity(second)), third);
});

test("shuffle treats duplicate recordings as separate occurrences", () => {
  const first = { id: "same-track1", queueEntryId: "context:1:same-track1" };
  const second = { id: "same-track1", queueEntryId: "user:2:same-track1" };
  const third = { id: "othertrack1", queueEntryId: "context:3:othertrack1" };
  const fourth = { id: "lasttrack01", queueEntryId: "context:4:lasttrack01" };
  const queue = [first, second, third, fourth];

  const shuffled = shuffleUpcoming(queue, queueEntryIdentity(second), () => 0);
  assert.deepEqual(shuffled.slice(0, 2), [first, second]);
  assert.deepEqual(shuffled.slice(2), [fourth, third]);
});


test("same video ID advances when the next row is a different queue occurrence", () => {
  const first = { id: "same-track1", queueEntryId: "context:1:same-track1" };
  const second = { id: "same-track1", queueEntryId: "user:2:same-track1" };
  assert.equal(queueAdvanceDecision(first, second), "advance");
  assert.equal(queueAdvanceDecision(first, first), "replay");
  assert.equal(queueAdvanceDecision(first, second, { avoidId: first.id }), "blocked");
});


test("unshuffle restores duplicate occurrences in their original order", () => {
  const first = { id: "same-track1", queueEntryId: "context:1:same-track1" };
  const second = { id: "same-track1", queueEntryId: "user:2:same-track1" };
  const third = { id: "othertrack1", queueEntryId: "context:3:othertrack1" };
  const fourth = { id: "lasttrack01", queueEntryId: "context:4:lasttrack01" };
  const original = [first, second, third, fourth];
  const shuffled = [first, second, fourth, third];

  assert.equal(typeof playerQueue.restoreQueueOrder, "function");
  if (typeof playerQueue.restoreQueueOrder !== "function") return;
  assert.deepEqual(
    playerQueue.restoreQueueOrder(shuffled, original.map(queueEntryIdentity)),
    original,
  );
});


test("failure recovery skips duplicate occurrences of the rejected provider video", () => {
  const first = { id: "same-track1", queueEntryId: "context:1:same-track1" };
  const duplicate = { id: "same-track1", queueEntryId: "user:2:same-track1" };
  const recovery = { id: "othertrack1", queueEntryId: "context:3:othertrack1" };
  const queue = [first, duplicate, recovery];

  assert.equal(
    nextQueueTrack(queue, queueEntryIdentity(first), false, { avoidId: first.id }),
    recovery,
  );
  assert.equal(
    nextQueueTrack([first, duplicate], queueEntryIdentity(first), false, { avoidId: first.id }),
    null,
  );
});


test("queue consumer lists remove only the current occurrence, not every duplicate video id", () => {
  const first = { id: "same-track1", queueEntryId: "context:1:same-track1" };
  const second = { id: "same-track1", queueEntryId: "user:2:same-track1" };
  const third = { id: "othertrack1", queueEntryId: "context:3:othertrack1" };
  assert.equal(typeof playerQueue.queueWithoutCurrentOccurrence, "function");
  if (typeof playerQueue.queueWithoutCurrentOccurrence !== "function") return;
  assert.deepEqual(
    playerQueue.queueWithoutCurrentOccurrence([first, second, third], first),
    [second, third],
  );
});
