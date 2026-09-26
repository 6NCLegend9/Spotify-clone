import assert from "node:assert/strict";
import test from "node:test";
import {
  YOUTUBE_SEARCH_PURPOSES,
  normalizeYoutubeSearchPurpose,
  youtubeSearchLimitFor,
} from "../src/utils/youtubeSearchPurpose.mjs";

test("youtube search purposes normalize unknown values to interactive", () => {
  assert.deepEqual(YOUTUBE_SEARCH_PURPOSES, ["interactive", "radio", "queue", "discovery"]);
  assert.equal(normalizeYoutubeSearchPurpose("radio"), "radio");
  assert.equal(normalizeYoutubeSearchPurpose("QUEUE"), "queue");
  assert.equal(normalizeYoutubeSearchPurpose("unknown"), "interactive");
  assert.equal(normalizeYoutubeSearchPurpose(""), "interactive");
  assert.equal(normalizeYoutubeSearchPurpose(null), "interactive");
});

test("every youtube search purpose has a finite positive budget", () => {
  for (const purpose of YOUTUBE_SEARCH_PURPOSES) {
    const budget = youtubeSearchLimitFor(purpose);
    assert.equal(Number.isFinite(budget.windowMs), true);
    assert.equal(Number.isFinite(budget.max), true);
    assert.ok(budget.windowMs >= 1_000);
    assert.ok(budget.max >= 1);
  }
  assert.ok(youtubeSearchLimitFor("radio").max > youtubeSearchLimitFor("interactive").max);
});
