import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("radio exhaustion stops instead of recycling already-played queue entries", async () => {
  const player = await read("src/components/MusicPlayer/YouTubePlayer.jsx");

  assert.doesNotMatch(player, /const fallback = list\.find/);
  assert.doesNotMatch(
    player,
    /if \(avoidId\) return false;\s*replayCurrent\(\);\s*return true;/,
  );
  assert.match(
    player,
    /const extras = await extendQueueRef\.current\(\);[\s\S]*const next = getNextVideo\(\{ avoidId \}\)[\s\S]*if \(next[\s\S]*dispatch\(setYoutubeVideo\(next\)\);[\s\S]*userPausedRef\.current = true;[\s\S]*dispatch\(playPause\(false\)\);[\s\S]*return false;/,
  );
});
