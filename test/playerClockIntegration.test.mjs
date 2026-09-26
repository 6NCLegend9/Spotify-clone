import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("YouTube playback clock stays external while presentation-owned lyrics subscribe to it", async () => {
  const [player, dock, presentation] = await Promise.all([
    readFile(path.join(root, "src/components/MusicPlayer/YouTubePlayer.jsx"), "utf8"),
    readFile(path.join(root, "src/components/MusicPlayer/PlayerDock.tsx"), "utf8"),
    readFile(path.join(root, "src/components/MusicPlayer/MediaPresentation.tsx"), "utf8"),
  ]);

  assert.match(player, /createPlaybackClockStore/);
  assert.match(player, /publishPlaybackTick/);
  assert.match(player, /lastUiClockCommitRef/);
  assert.match(player, /playbackClock=\{playbackClock\}/);
  assert.match(player, /ClockedCaptionKaraoke/);
  assert.match(player, /ClockedPictureInPictureWindow/);
  assert.match(player, /playbackClock\.read\(\)\.position/);
  assert.doesNotMatch(
    player,
    /setCurrentTime\(safeMediaTime\(seekPending \? guard\.target : time\)\)/,
  );

  assert.match(dock, /<MediaPresentation ref=\{presentationRef\} \{\.\.\.props\}/);
  assert.match(presentation, /ClockedSyncedLyrics/);
  assert.match(presentation, /clock=\{props\.playbackClock\}/);
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
