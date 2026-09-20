import test from "node:test";
import assert from "node:assert/strict";
import { youtubePlaybackError } from "../src/utils/youtubePlaybackError.mjs";

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
