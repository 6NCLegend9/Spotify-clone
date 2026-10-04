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


test("expanded YouTube controls do not imply HayKasa can choose provider stream quality", async () => {
  const presentation = await readFile(path.join(root, "src/components/MusicPlayer/MediaPresentation.tsx"), "utf8");
  assert.doesNotMatch(presentation, /Video quality settings|>Quality settings</);
  assert.match(presentation, /aria-label="Playback settings"/);
});


test("keyboard shortcut settings list only implemented letter commands", async () => {
  const settings = await readFile(path.join(root, "src/app/settings/page.jsx"), "utf8");
  assert.doesNotMatch(settings, /J, L, M, F, P, and T/);
  assert.match(settings, /J, L, M, F\/V, and T/);
});
