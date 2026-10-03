import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("desktop floating-player UI does not claim native video picture-in-picture", async () => {
  const [settings, youtubePlayer] = await Promise.all([
    readFile(path.join(root, "src/app/settings/page.jsx"), "utf8"),
    readFile(path.join(root, "src/components/MusicPlayer/YouTubePlayer.jsx"), "utf8"),
  ]);

  assert.doesNotMatch(settings, /Picture-in-picture \(desktop\)/i);
  assert.match(settings, /Floating player \(desktop\)/i);

  assert.doesNotMatch(youtubePlayer, /pipLabel=.*Picture in picture/i);
  assert.match(youtubePlayer, /Floating player controls/);
});
