import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const stage = await readFile(new URL("../src/components/Arcade/ArcadeStage.jsx", import.meta.url), "utf8");
const clock = await readFile(new URL("../src/hooks/useArcadeClock.js", import.meta.url), "utf8");

test("Arcade remote playback controls carry queue occurrence identity", () => {
  assert.match(stage, /const youtubeQueueEntryId = youtubeVideo\?\.queueEntryId \|\| null/);
  assert.match(stage, /useArcadeClock\(\{ source, audioRef, videoId, queueEntryId \}\)/);
  assert.match(stage, /detail:\s*\{\s*videoId:\s*track\.id,\s*queueEntryId:\s*track\.queueEntryId/);
  assert.match(stage, /JAM_REMOTE_PLAYBACK_EVENT[\s\S]*queueEntryId:/);
  assert.match(stage, /JAM_REMOTE_SEEK_EVENT[\s\S]*queueEntryId:/);
});

test("Arcade clock resets and filters reports by queue occurrence, not only video ID", () => {
  assert.match(clock, /queueOccurrenceMatches/);
  assert.match(clock, /queueEntryIdRef/);
  assert.match(clock, /\[videoId, queueEntryId, source\]/);
  assert.match(clock, /queueEntryId:\s*queueEntryIdRef\.current/);
});
