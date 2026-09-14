import test from "node:test";
import assert from "node:assert/strict";
import { editUpcomingQueue } from "../src/utils/playerQueue.mjs";

const track = (id, title = id) => ({ id, title });

test("reorders an upcoming duplicate independently of the current track", () => {
  const queue = [track("same", "Current"), track("same", "Duplicate"), track("b"), track("c")];
  const next = editUpcomingQueue(queue, "same", { kind: "reorder", index: 1, toIndex: 3 });
  assert.deepEqual(next.map((item) => item.title), ["Current", "b", "c", "Duplicate"]);
});

test("removes an upcoming duplicate by row index", () => {
  const queue = [track("same", "Current"), track("same", "Duplicate"), track("b")];
  const next = editUpcomingQueue(queue, "same", { kind: "remove", index: 1 });
  assert.deepEqual(next.map((item) => item.title), ["Current", "b"]);
});

test("never drags an upcoming row before the current-track boundary", () => {
  const queue = [track("a"), track("b"), track("c")];
  const next = editUpcomingQueue(queue, "a", { kind: "reorder", index: 2, toIndex: 0 });
  assert.deepEqual(next.map((item) => item.id), ["a", "c", "b"]);
});

test("clear keeps the current track and removes upcoming rows", () => {
  const queue = [track("a"), track("b"), track("c")];
  const next = editUpcomingQueue(queue, "a", { kind: "clear" });
  assert.deepEqual(next.map((item) => item.id), ["a"]);
});
