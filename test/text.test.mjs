import assert from "node:assert/strict";
import test from "node:test";

import { cleanTitle, decodeHtmlEntities, decodeTrackFields } from "../src/utils/text.js";

test("decodeHtmlEntities turns apostrophe codes into real apostrophes", () => {
  assert.equal(decodeHtmlEntities("Troublesome &#39;96"), "Troublesome '96");
  assert.equal(decodeHtmlEntities("It Ain&#x27;t Easy"), "It Ain't Easy");
  assert.equal(decodeHtmlEntities("R&amp;B"), "R&B");
});

test("decodeHtmlEntities unwraps double-encoded entities and emoji code points", () => {
  assert.equal(decodeHtmlEntities("Troublesome &amp;#39;96"), "Troublesome '96");
  assert.equal(decodeHtmlEntities("Love &#128153;"), "Love 💙");
  assert.equal(decodeHtmlEntities("Notes &#x1F3B5;"), "Notes 🎵");
});

test("cleanTitle trims and keeps readable punctuation", () => {
  assert.equal(cleanTitle("  Don&rsquo;t Stop  "), "Don’t Stop");
  assert.equal(cleanTitle("   "), "");
  assert.equal(cleanTitle("   ", "Song"), "Song");
});

test("decodeTrackFields cleans title and channel on a track object", () => {
  const decoded = decodeTrackFields({
    id: "abc",
    title: "Troublesome &#39;96",
    channel: "2Pac &amp; Friends",
  });
  assert.equal(decoded.title, "Troublesome '96");
  assert.equal(decoded.channel, "2Pac & Friends");
  assert.equal(decoded.id, "abc");
});
