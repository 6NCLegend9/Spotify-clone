import assert from "node:assert/strict";
import test from "node:test";
import { isPlaybackCommand, sanitizePlaybackState } from "../src/playback.mjs";

test("playback state keeps https artwork and drops everything else", () => {
  assert.deepEqual(sanitizePlaybackState(null), {
    hasTrack: false,
    playing: false,
    canPlay: false,
    canSkip: false,
    canPrev: false,
    title: "",
    artist: "",
    artwork: "",
  });
  const next = sanitizePlaybackState({
    hasTrack: true,
    playing: true,
    canPlay: true,
    canSkip: false,
    canPrev: true,
    title: `  ${"x".repeat(200)}  `,
    artist: "<script>alert(1)</script>",
    artwork: "javascript:alert(1)",
  });
  assert.equal(next.hasTrack, true);
  assert.equal(next.playing, true);
  assert.equal(next.canPlay, true);
  assert.equal(next.canSkip, false);
  assert.equal(next.canPrev, true);
  assert.equal(next.title.length, 120);
  assert.equal(next.artwork, "");
  assert.equal(sanitizePlaybackState({
    hasTrack: true,
    artwork: "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg",
  }).artwork, "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg");
});

test("tray commands are play-pause, skip, and prev", () => {
  assert.equal(isPlaybackCommand("play-pause"), true);
  assert.equal(isPlaybackCommand("skip"), true);
  assert.equal(isPlaybackCommand("prev"), true);
  assert.equal(isPlaybackCommand("quit"), false);
  assert.equal(isPlaybackCommand("open"), false);
});
