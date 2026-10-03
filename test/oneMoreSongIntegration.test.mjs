import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("YouTube one-more picker receives current, queue, and listening-history metadata", async () => {
  const player = await read("src/components/MusicPlayer/YouTubePlayer.jsx");

  assert.match(player, /const queuedTracks = Array\.isArray\(queueRef\.current\)/);
  assert.match(player, /pickOneMoreTrack\(data\?\.results, \{[\s\S]*current: video,/);
  assert.match(player, /queue: queuedTracks,/);
  assert.match(player, /history: playbackHistory,/);
});
