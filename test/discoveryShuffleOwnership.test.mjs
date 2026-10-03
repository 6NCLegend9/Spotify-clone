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
  assert.doesNotMatch(source, /dispatch\(setAutoAdd/);
  assert.match(
    source,
    /if \(isLiked\) \{[\s\S]*?writeDiscoveryShufflePreference\(window\.localStorage, nextValue\);[\s\S]*?\}/,
  );
});


test("Liked Songs owns discovery preference hydration without requiring Home to mount first", async () => {
  const [detail, home, player] = await Promise.all([
    readFile(path.join(root, "src/components/Library/PlaylistDetail.jsx"), "utf8"),
    readFile(path.join(root, "src/hooks/useHomeFeed.js"), "utf8"),
    readFile(path.join(root, "src/redux/features/playerSlice.js"), "utf8"),
  ]);
  assert.match(detail, /readDiscoveryShufflePreference/);
  assert.match(detail, /if \(!isLiked\) return;[\s\S]*readDiscoveryShufflePreference\(window\.localStorage\)/);
  assert.doesNotMatch(home, /setAutoAdd|readDiscoveryShufflePreference/);
  assert.doesNotMatch(player, /\bautoAdd\b|\bsetAutoAdd\b/);
});
