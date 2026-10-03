import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("YouTube listening observations are scoped to queue occurrence identity", async () => {
  const [hook, player] = await Promise.all([
    read("src/hooks/useListeningInsights.js"),
    read("src/components/MusicPlayer/YouTubePlayer.jsx"),
  ]);

  assert.match(
    hook,
    /useListeningInsights\(\{ owner, trackId, occurrenceId, enabled, getSample \}\)/,
  );
  assert.match(
    hook,
    /latest\.current = \{ owner, enabled, trackId, occurrenceId, getSample \}/,
  );
  assert.match(
    hook,
    /latest\.current\.occurrenceId !== occurrenceId/,
  );
  assert.match(
    hook,
    /\[owner, trackId, occurrenceId, enabled\]/,
  );
  assert.match(
    player,
    /occurrenceId:\s*video\?\.queueEntryId \|\| videoId/,
  );
});
