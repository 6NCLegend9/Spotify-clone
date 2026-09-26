import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

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
