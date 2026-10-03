import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("YouTube recovery state is scoped to the active queue occurrence and stale async fallbacks are ignored", async () => {
  const player = await read("src/components/MusicPlayer/YouTubePlayer.jsx");

  assert.match(player, /youtubeRecoveryScope\(current\)/);
  assert.match(player, /failureResolveRef\.current === recoveryScope\.identity/);
  assert.match(player, /youtubeRecoveryScopeMatches\(sameIdRetryRef\.current, current\)/);
  assert.match(player, /alternateAttemptRef\.current\.identity !== recoveryScope\.identity/);
  assert.match(player, /youtubeRecoveryScopeMatches\(recoveryScope, videoRef\.current\)/);
  assert.match(player, /const getNextVideo = \(\{ avoidId = null \} = \{\}\) =>/);
  assert.match(player, /const immediate = getNextVideo\(\{ avoidId \}\)/);
  assert.match(
    player,
    /activeTrackStartedRef\.current = \{\s*identity: queueEntryIdentity\(nextVideo\),\s*videoId: nextVideo\.id,/,
  );
  assert.match(
    player,
    /activeTrackStartedRef\.current = \{\s*identity: occurrenceIdentity,\s*videoId: video\.id,/,
  );
  assert.doesNotMatch(player, /failureResolveRef\.current === current\.id/);
});
