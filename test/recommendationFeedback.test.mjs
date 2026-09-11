import assert from "node:assert/strict";
import test from "node:test";
import { activeSnoozedTracks, updateFeedback } from "../src/utils/recommendationFeedback.mjs";

test("new snoozes expire after seven days; legacy snoozes stay explicitly restorable", () => {
  const now = 1000;
  const profile = { snoozedTracks: ["legacy"] };
  Object.assign(profile, updateFeedback(profile, "snoozedTracks", "new", false, now));
  assert.deepEqual(activeSnoozedTracks(profile, now), ["legacy", "new"]);
  assert.deepEqual(activeSnoozedTracks(profile, now + 7 * 86400_000), ["legacy"]);
  Object.assign(profile, updateFeedback(profile, "snoozedTracks", "legacy", true, now));
  assert.deepEqual(activeSnoozedTracks(profile, now), ["new"]);
});

test("feedback restoration is idempotent, deduplicates and enforces a bounded history", () => {
  const values = Array.from({ length: 200 }, (_, index) => String(index));
  const changes = updateFeedback({ notInterested: values }, "notInterested", "new", false, 1000);
  assert.equal(changes.notInterested.length, 200);
  assert.equal(changes.notInterested[199], "new");
  const restored = updateFeedback(changes, "notInterested", "new", true, 1000);
  assert.deepEqual(updateFeedback(restored, "notInterested", "new", true, 1000), restored);
});