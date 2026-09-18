import assert from "node:assert/strict";
import test from "node:test";
import {
  isYoutubeVideoId,
  sanitizeYoutubeComment,
  sanitizeYoutubeComments,
} from "../src/utils/youtubeComments.mjs";

test("accepts only YouTube video ids", () => {
  assert.equal(isYoutubeVideoId("abcdefghijk"), true);
  assert.equal(isYoutubeVideoId("bad id"), false);
  assert.equal(isYoutubeVideoId("<script>"), false);
});

test("keeps a short top-comment list without markup or links", () => {
  const comments = sanitizeYoutubeComments([
    {
      id: "1",
      author: "<b>Maya</b>",
      text: "This live version hits https://evil.example harder than the studio cut.",
      likeCount: 42,
    },
    { id: "1", author: "Dup", text: "duplicate id is dropped" },
    { id: "2", author: "Sam", text: "  " },
    ...Array.from({ length: 12 }, (_, index) => ({
      id: `extra-${index}`,
      author: "Fan",
      text: `Comment ${index}`,
    })),
  ]);
  assert.equal(comments.length, 8);
  assert.equal(comments[0].author, "Maya");
  assert.equal(comments[0].text.includes("https://"), false);
  assert.equal(comments[0].text.includes("<"), false);
  assert.equal(sanitizeYoutubeComment(null), null);
});
