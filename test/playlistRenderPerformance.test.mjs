import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("large playlist rendering isolates row work from unrelated player state", async () => {
  const detail = await readFile(
    path.join(root, "src/components/Library/PlaylistDetail.jsx"),
    "utf8",
  );
  const row = await readFile(
    path.join(root, "src/components/Library/PlaylistTrackRow.jsx"),
    "utf8",
  );
  const virtualList = await readFile(
    path.join(root, "src/components/Library/VirtualizedPlaylistTrackList.jsx"),
    "utf8",
  );

  assert.match(detail, /state\.player\.youtubeVideo\?\.id/);
  assert.match(detail, /state\.player\.autoAdd/);
  assert.doesNotMatch(detail, /const \{ youtubeVideo, autoAdd \} = useSelector\(\(state\) => state\.player\)/);
  assert.match(detail, /handleRowPlay/);
  assert.match(detail, /handleRowRemove/);
  assert.match(row, /memo\(PlaylistTrackRow\)/);
  assert.match(detail, /VirtualizedPlaylistTrackList/);
  assert.doesNotMatch(detail, /filteredTracks\.map\(/);
  assert.match(virtualList, /shouldVirtualizePlaylist/);
  assert.match(virtualList, /data-mounted-rows/);
  assert.match(virtualList, /items\.slice\(range\.start, range\.end\)/);
});


test("playlist scroll restoration is bounded and does not key memory by search text", async () => {
  const module = await import(
    pathToFileURL(path.join(root, "src/utils/virtualPlaylist.mjs")).href + `?t=${Date.now()}`
  );
  const memory = new Map();
  for (let index = 0; index < 100; index += 1) {
    module.rememberPlaylistScrollOffset(memory, `playlist-${index}`, index * 10, { limit: 32 });
  }

  assert.equal(memory.size, 32);
  assert.equal(memory.has("playlist-0"), false);
  assert.equal(memory.has("playlist-99"), true);
  assert.equal(module.recallPlaylistScrollOffset(memory, "playlist-99"), 990);

  const detail = await readFile(
    path.join(root, "src/components/Library/PlaylistDetail.jsx"),
    "utf8",
  );
  assert.doesNotMatch(detail, /scrollKey=\{[^\n]*deferredSearch/);
});
