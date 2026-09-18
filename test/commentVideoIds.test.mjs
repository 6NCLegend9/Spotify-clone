import assert from "node:assert/strict";
import test from "node:test";
import { videoIdsMentionedInText } from "../src/utils/commentVideoIds.mjs";

test("extracts watch, share, and shorts ids from raw comment text", () => {
  const ids = videoIdsMentionedInText(
    "start with https://www.youtube.com/watch?v=abcdefghijk then https://youtu.be/lmnopqrstuv and https://youtube.com/shorts/ShortVideo1 plus a duplicate https://youtube.com/watch?feature=share&v=abcdefghijk",
  );
  assert.deepEqual(ids, ["abcdefghijk", "lmnopqrstuv", "ShortVideo1"]);
});

test("ignores non-video URLs and junk ids", () => {
  assert.deepEqual(videoIdsMentionedInText("see https://evil.example/watch?v=abcdefghijk"), []);
  assert.deepEqual(videoIdsMentionedInText("youtube.com/watch?v=bad id!!"), []);
});
