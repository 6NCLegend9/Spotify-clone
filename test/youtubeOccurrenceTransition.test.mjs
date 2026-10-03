import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readPlayer = () => readFile(new URL("../src/components/MusicPlayer/YouTubePlayer.jsx", import.meta.url), "utf8");

test("crossfade promotion and ended guards are scoped to queue occurrence identity", async () => {
  const player = await readPlayer();

  assert.match(player, /const handledOccurrenceRef = useRef\(null\)/);
  assert.doesNotMatch(player, /handledVideoIdRef/);
  assert.match(
    player,
    /queueEntryIdentity\(pendingNextRef\.current\) !== queueEntryIdentity\(nextVideo\)/,
  );
  assert.match(
    player,
    /const endedToken = `\$\{key\}:\$\{generation\}:\$\{queueEntryIdentity\(videoRef\.current\) \|\| ""\}`/,
  );
});

test("per-track transition state resets for duplicate provider IDs by queue occurrence", async () => {
  const player = await readPlayer();

  assert.doesNotMatch(player, /skipCrossfadeVideoRef/);
  assert.match(player, /const endFadeOccurrenceRef = useRef\(null\)/);
  assert.doesNotMatch(player, /endFadeVideoRef/);
  assert.match(
    player,
    /endFadeOccurrenceRef\.current !== queueEntryIdentity\(videoRef\.current\)/,
  );
  assert.match(
    player,
    /\}, \[video\?\.id, video\?\.queueEntryId\]\);/,
  );
  assert.match(
    player,
    /\}, \[videoId, video\?\.queueEntryId, queue, apiReady, transitionMode, dataSaver\]\);/,
  );
});

test("manual skip volume restoration is scoped to the same queue occurrence", async () => {
  const player = await readPlayer();

  assert.match(player, /const fromIdentity = queueEntryIdentity\(videoRef\.current\)/);
  assert.match(
    player,
    /queueEntryIdentity\(videoRef\.current\) === fromIdentity && !fadeTimerRef\.current/,
  );
});
