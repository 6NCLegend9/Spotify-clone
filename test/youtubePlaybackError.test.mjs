import test from "node:test";
import assert from "node:assert/strict";
import {
  alternateSearchQuery,
  MAX_ALTERNATE_ATTEMPTS,
  MAX_SAME_ID_RETRIES,
  youtubePlaybackError,
  youtubePlaybackFailurePolicy,
} from "../src/utils/youtubePlaybackError.mjs";

test("retry is not offered for embedding restrictions or unavailable uploads", () => {
  for (const code of [100, 101, 150, "150"]) {
    assert.equal(youtubePlaybackError(code).canRetry, false);
  }
  assert.match(youtubePlaybackError(150).detail, /guest mode cannot remove/);
});

test("transient and identification failures retain manual retry", () => {
  for (const code of [2, 5, 153, 999]) {
    assert.equal(youtubePlaybackError(code).canRetry, true);
  }
  assert.match(youtubePlaybackError(153).message, /verify this player/);
  assert.match(youtubePlaybackError(999).detail, /does not sign you in to YouTube/);
});

test("failure policy: autoplay stays fatal UI", () => {
  assert.equal(youtubePlaybackFailurePolicy({ kind: "autoplay" }).action, "fatalUI");
});

test("failure policy: embed blocks go straight to alternate then skip", () => {
  assert.equal(youtubePlaybackFailurePolicy({ code: 150, sameIdAttempts: 0, alternateAttempts: 0 }).action, "tryAlternate");
  assert.equal(
    youtubePlaybackFailurePolicy({ code: 100, sameIdAttempts: 0, alternateAttempts: MAX_ALTERNATE_ATTEMPTS }).action,
    "skipQueue",
  );
});

test("failure policy: transient errors retry same id before alternate", () => {
  assert.equal(youtubePlaybackFailurePolicy({ code: 5, sameIdAttempts: 0 }).action, "retrySame");
  assert.equal(
    youtubePlaybackFailurePolicy({ code: 5, sameIdAttempts: MAX_SAME_ID_RETRIES, alternateAttempts: 0 }).action,
    "tryAlternate",
  );
  assert.equal(
    youtubePlaybackFailurePolicy({ code: 5, sameIdAttempts: MAX_SAME_ID_RETRIES, alternateAttempts: MAX_ALTERNATE_ATTEMPTS }).error.canRetry,
    true,
  );
});

test("failure policy: stalls skip same-id retries because buffer recovery already reloaded", () => {
  assert.equal(youtubePlaybackFailurePolicy({ code: "stall", sameIdAttempts: 0, alternateAttempts: 0 }).action, "tryAlternate");
  assert.equal(
    youtubePlaybackFailurePolicy({ code: "stall", sameIdAttempts: 0, alternateAttempts: MAX_ALTERNATE_ATTEMPTS }).action,
    "skipQueue",
  );
});

test("alternate search query prefers title and channel", () => {
  assert.equal(
    alternateSearchQuery({ title: "Post To Be", channel: "Omarion" }),
    "Post To Be Omarion",
  );
});
