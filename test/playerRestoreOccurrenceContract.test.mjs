import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("playback restore delegates occurrence reconciliation to the shared queue helper", async () => {
  const slice = await read("src/redux/features/playerSlice.js");
  assert.match(slice, /restoreQueueOccurrenceState/);
  assert.doesNotMatch(
    slice,
    /youtubeQueue\.some\(\(track\) => track\.id === youtubeVideo\.id\)/,
  );
  assert.doesNotMatch(
    slice,
    /track\?\.queueSource === 'user' && track\.id !== youtubeVideo\?\.id/,
  );
});
