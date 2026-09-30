import assert from "node:assert/strict";
import test from "node:test";
import { shouldHoldPlaybackWakeLock } from "../src/utils/wakeLockPolicy.mjs";

test("audio-only playback never requests a screen wake lock", () => {
  assert.equal(shouldHoldPlaybackWakeLock({
    isPlaying: true,
    mediaTheater: false,
    videoVisible: false,
  }), false);
});

test("visible theater video may keep the screen awake while playing", () => {
  assert.equal(shouldHoldPlaybackWakeLock({
    isPlaying: true,
    mediaTheater: true,
    videoVisible: true,
  }), true);
  assert.equal(shouldHoldPlaybackWakeLock({
    isPlaying: false,
    mediaTheater: true,
    videoVisible: true,
  }), false);
});
