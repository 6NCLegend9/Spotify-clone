import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("playlist UI does not overstate generic discovery shuffle as Smart Shuffle", async () => {
  const files = [
    "src/components/Library/PlaylistDetail.jsx",
    "src/components/Library/LibraryView.jsx",
  ];
  for (const file of files) {
    const source = await readFile(path.join(root, file), "utf8");
    assert.doesNotMatch(source, />\s*Smart Shuffle\b|["']Smart Shuffle\b/);
    assert.match(source, /Shuffle \+ Discovery/);
  }
});

test("project TODO does not claim true crossfade is functional", async () => {
  const source = await readFile(path.join(root, "TODO.md"), "utf8");
  assert.doesNotMatch(source, /Crossfade\/fade \+ Smart Shuffle functional/);
  assert.match(source, /true overlapping crossfade remains disabled/i);
});
