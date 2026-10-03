import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("playlist-specific discovery never overwrites the Liked Songs preference", async () => {
  const source = await readFile(path.join(root, "src/components/Library/PlaylistDetail.jsx"), "utf8");
  assert.doesNotMatch(
    source,
    /setSmartShuffle\(nextValue\);\s*dispatch\(setAutoAdd\(nextValue\)\);/,
  );
  assert.match(
    source,
    /if \(isLiked\) \{[\s\S]*?dispatch\(setAutoAdd\(nextValue\)\);[\s\S]*?writeDiscoveryShufflePreference\(window\.localStorage, nextValue\);[\s\S]*?\}/,
  );
});
