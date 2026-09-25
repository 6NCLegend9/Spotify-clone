import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("YouTube player isolates high-frequency clock updates from broad React state", async () => {
  const source = await readFile(
    path.join(root, "src/components/MusicPlayer/YouTubePlayer.jsx"),
    "utf8",
  );

  assert.match(source, /createPlaybackClockStore/);
  assert.match(source, /publishPlaybackTick/);
  assert.match(source, /lastUiClockCommitRef/);
  assert.match(source, /ClockedSyncedLyrics/);
  assert.match(source, /ClockedCaptionKaraoke/);
  assert.match(source, /ClockedPictureInPictureWindow/);
  assert.match(source, /playbackClock\.read\(\)\.position/);
  assert.doesNotMatch(
    source,
    /setCurrentTime\(safeMediaTime\(seekPending \? guard\.target : time\)\)/,
  );
});

test("clocked media surfaces subscribe through useSyncExternalStore", async () => {
  const hook = await readFile(
    path.join(root, "src/components/MusicPlayer/usePlaybackClock.js"),
    "utf8",
  );
  assert.match(hook, /useSyncExternalStore/);

  for (const file of [
    "ClockedSyncedLyrics.jsx",
    "ClockedCaptionKaraoke.jsx",
    "ClockedPictureInPictureWindow.jsx",
  ]) {
    const source = await readFile(
      path.join(root, "src/components/MusicPlayer", file),
      "utf8",
    );
    assert.match(source, /usePlaybackClock/);
  }
});
