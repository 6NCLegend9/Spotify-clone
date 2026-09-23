import test from "node:test";
import assert from "node:assert/strict";
import {
  buildOfficialMusicQuery,
  officialMusicScore,
  rankOfficialMusicResults,
  sanitizeMusicSearchQuery,
} from "../src/utils/officialMusicSearch.mjs";

test("sanitizes a music query without rewriting the requested version", () => {
  assert.equal(sanitizeMusicSearchQuery("  Omarion\nPost To Be  "), "Omarion Post To Be");
  assert.equal(
    buildOfficialMusicQuery("Omarion Post To Be Official Music Video"),
    "Omarion Post To Be Official Music Video",
  );
});

test("preserves non-English searches and explicitly requested versions", () => {
  for (const query of ["אדיר גץ", "አስቴር አወቀ", "Adele Hello live", "Hello karaoke"]) {
    assert.equal(buildOfficialMusicQuery(query), query);
  }
});

test("the requested song outranks a less relevant upload with official branding", () => {
  const song = { title: "Adele - Hello", channel: "Adele" };
  const unrelated = { title: "Adele - Easy On Me (Official Music Video)", channel: "AdeleVEVO" };
  assert.deepEqual(rankOfficialMusicResults([unrelated, song], "Adele Hello"), [song, unrelated]);
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

test("buildOfficialMusicQuery never appends junk official tokens", () => {
  assert.equal(buildOfficialMusicQuery("Hello"), "Hello");
  assert.equal(buildOfficialMusicQuery("Hello official"), "Hello official");
  assert.ok(!buildOfficialMusicQuery("Shape of You").toLowerCase().endsWith(" music video"));
});
