import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("youtube playlist API paginates up to 100 playable tracks", () => {
  const source = readFileSync(join(root, "src/app/api/youtube-playlist/route.js"), "utf8");
  assert.match(source, /MAX_PLAYLIST_TRACKS = 100/);
  assert.match(source, /pageToken/);
  assert.match(source, /maxResults: String\(Math\.min\(50/);
});

test("featured playlist cards open in-app and play the whole playlist as a collection", () => {
  const source = readFileSync(join(root, "src/components/Homepage/MixCard.jsx"), "utf8");
  const hrefSource = readFileSync(join(root, "src/utils/discoveryPlaylist.mjs"), "utf8");
  assert.doesNotMatch(source, /youtube\.com\/playlist/);
  assert.match(source, /discoveryPlaylistHref\(mix\)/);
  assert.match(hrefSource, /\/youtube-playlist\//);
  assert.match(source, /queueMode: "collection"/);
});

test("recently played surfaces route to /recently-played", () => {
  const home = readFileSync(join(root, "src/components/Homepage/Home.jsx"), "utf8");
  const sidebar = readFileSync(join(root, "src/components/Sidebar/Sidebar.jsx"), "utf8");
  assert.match(home, /seeAllHref="\/recently-played"/);
  assert.match(sidebar, /\/recently-played/);
  assert.doesNotMatch(home, /seeAllHref="\/history"/);
});
