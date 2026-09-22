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

test("SongBar opens playlists in-app instead of external YouTube", () => {
  const source = readFileSync(join(root, "src/components/Homepage/SongBar.jsx"), "utf8");
  assert.doesNotMatch(source, /youtube\.com\/playlist/);
  assert.match(source, /\/youtube-playlist\//);
  assert.match(source, /\/api\/youtube-playlist/);
});

test("recently played surfaces route to /recently-played", () => {
  const home = readFileSync(join(root, "src/components/Homepage/Home.jsx"), "utf8");
  const sidebar = readFileSync(join(root, "src/components/Sidebar/Sidebar.jsx"), "utf8");
  assert.match(home, /seeAllHref="\/recently-played"/);
  assert.match(sidebar, /\/recently-played/);
  assert.doesNotMatch(home, /seeAllHref="\/history"/);
});
