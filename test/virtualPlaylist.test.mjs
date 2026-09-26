import assert from "node:assert/strict";
import test from "node:test";
import {
  PLAYLIST_ROW_HEIGHT,
  PLAYLIST_VIRTUALIZE_THRESHOLD,
  playlistScrollOffsetForIndex,
  shouldVirtualizePlaylist,
  virtualPlaylistRange,
} from "../src/utils/virtualPlaylist.mjs";

test("large playlists virtualize from the configured threshold", () => {
  assert.equal(shouldVirtualizePlaylist(PLAYLIST_VIRTUALIZE_THRESHOLD - 1), false);
  assert.equal(shouldVirtualizePlaylist(PLAYLIST_VIRTUALIZE_THRESHOLD), true);
});

for (const count of [500, 2000, 5000]) {
  test(`${count}-track playlist mounts a bounded viewport-sized range`, () => {
    const range = virtualPlaylistRange({
      count,
      rowHeight: PLAYLIST_ROW_HEIGHT,
      containerTop: -(Math.floor(count / 2) * PLAYLIST_ROW_HEIGHT),
      viewportHeight: 900,
    });
    assert.ok(range.end > range.start);
    assert.ok(range.end - range.start < 100);
    assert.equal(range.totalHeight, count * PLAYLIST_ROW_HEIGHT);
  });
}

test("active-track reveal offset centers a distant row and clamps to list bounds", () => {
  const count = 5000;
  const middle = playlistScrollOffsetForIndex({
    index: 4200,
    count,
    rowHeight: PLAYLIST_ROW_HEIGHT,
    viewportHeight: 844,
  });
  assert.ok(middle > 0);
  assert.ok(middle < count * PLAYLIST_ROW_HEIGHT);
  assert.equal(
    playlistScrollOffsetForIndex({ index: -1, count, viewportHeight: 844 }),
    0,
  );
  assert.equal(
    playlistScrollOffsetForIndex({ index: 99999, count, viewportHeight: 844 }),
    Math.max(0, count * PLAYLIST_ROW_HEIGHT - 844),
  );
});
