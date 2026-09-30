import assert from "node:assert/strict";
import test from "node:test";
import {
  virtualPlaylistRange,
  shouldVirtualizePlaylist,
} from "../src/utils/virtualPlaylist.mjs";

for (const count of [500, 2000, 5000]) {
  test(`virtualizes ${count} tracks into a bounded mounted range`, () => {
    const range = virtualPlaylistRange({
      count,
      rowHeight: 66,
      containerTop: -3300,
      viewportHeight: 844,
      overscan: 12,
    });
    assert.equal(shouldVirtualizePlaylist(count), true);
    assert.ok(range.start >= 0);
    assert.ok(range.end <= count);
    assert.ok(range.end - range.start < 100, `mounted ${range.end - range.start} rows`);
    assert.equal(range.totalHeight, count * 66);
  });
}

test("small playlists keep the simple direct rendering path", () => {
  assert.equal(shouldVirtualizePlaylist(199), false);
  assert.equal(shouldVirtualizePlaylist(200), true);
});

test("virtual range clamps before and after the list", () => {
  assert.deepEqual(
    virtualPlaylistRange({
      count: 10,
      rowHeight: 66,
      containerTop: 400,
      viewportHeight: 844,
      overscan: 4,
    }),
    { start: 0, end: 10, totalHeight: 660, offsetTop: 0 },
  );

  const end = virtualPlaylistRange({
    count: 5000,
    rowHeight: 66,
    containerTop: -(5000 * 66 - 300),
    viewportHeight: 844,
    overscan: 12,
  });
  assert.equal(end.end, 5000);
  assert.ok(end.start > 4900);
});
