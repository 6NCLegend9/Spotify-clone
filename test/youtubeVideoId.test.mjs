import assert from "node:assert/strict";
import test from "node:test";
import {
  isYoutubeVideoId,
} from "../src/utils/youtubeVideoId.mjs";

test("accepts only YouTube video ids", () => {
  assert.equal(isYoutubeVideoId("abcdefghijk"), true);
  assert.equal(isYoutubeVideoId("bad id"), false);
  assert.equal(isYoutubeVideoId("<script>"), false);
});
