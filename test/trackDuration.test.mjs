import test from "node:test";
import assert from "node:assert/strict";
import { formatDuration, withKnownDurations } from "../src/utils/trackDuration.mjs";

test("track duration floors seconds, supports hours, and leaves unknown values absent", () => {
  for (const [value, expected] of [[243.9, "4:03"], [59.9, "0:59"], [3723.9, "1:02:03"], [0, "—"], [undefined, "—"], [Infinity, "—"], [-1, "—"]]) assert.equal(formatDuration(value), expected);
});

test("Popular borrows only a known duration from the same video, preserving catalog credits", () => {
  const popular = [{ id: "abcdefghijk", duration: 0, title: "Music title", artists: [{ name: "Music artist" }] }, { id: "bcdefghijkl", duration: 120 }];
  const known = [{ id: "abcdefghijk", duration: 243, title: "Uploader title" }, { id: "abcdefghijk", duration: 0 }, { id: "bcdefghijkl", duration: 999 }];
  assert.deepEqual(withKnownDurations(popular, known), [{ ...popular[0], duration: 243 }, popular[1]]);
  assert.equal(popular[0].duration, 0);
});

test("elapsed player time starts at zero while a missing total remains unknown", async () => {
  const { formatElapsedTime } = await import("../src/utils/trackDuration.mjs");
  assert.equal(typeof formatElapsedTime, "function");
  assert.equal(formatElapsedTime(0), "0:00");
  assert.equal(formatElapsedTime(3723.9), "1:02:03");
  assert.equal(formatElapsedTime(undefined), "0:00");
  assert.equal(formatDuration(0), "—");
});
