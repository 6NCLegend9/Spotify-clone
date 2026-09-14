import test from "node:test";
import assert from "node:assert/strict";
import {
  buildOfficialMusicQuery,
  officialMusicScore,
  rankOfficialMusicResults,
  sanitizeMusicSearchQuery,
} from "../src/utils/officialMusicSearch.mjs";

test("sanitizes and builds one official music query", () => {
  assert.equal(sanitizeMusicSearchQuery("  Omarion\nPost To Be  "), "Omarion Post To Be");
  assert.equal(
    buildOfficialMusicQuery("Omarion Post To Be Official Music Video"),
    "Omarion Post To Be official music video|official audio",
  );
});

test("official sources outrank covers and lyric uploads", () => {
  const query = "Omarion Post To Be";
  const topic = { title: "Post To Be", channel: "Omarion - Topic" };
  const vevo = { title: "Omarion Ft. Chris Brown & Jhene Aiko - Post To Be (Official Music Video)", channel: "OmarionVEVO" };
  const cover = { title: "Post To Be cover lyrics", channel: "Random Karaoke" };
  assert.ok(officialMusicScore(vevo, query) > officialMusicScore(cover, query));
  assert.ok(officialMusicScore(topic, query) > officialMusicScore(cover, query));
  assert.deepEqual(rankOfficialMusicResults([cover, topic, vevo], query), [vevo, topic, cover]);
});

test("ranking is stable when candidates have the same score", () => {
  const first = { id: "a", title: "Unknown", channel: "Unknown" };
  const second = { id: "b", title: "Unknown", channel: "Unknown" };
  assert.deepEqual(rankOfficialMusicResults([first, second], "different query"), [first, second]);
});
