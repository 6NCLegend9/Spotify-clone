import test from "node:test";
import assert from "node:assert/strict";
import {
  buildOfficialMusicQuery,
  filterMusicPlaybackResults,
  isMusicPlaybackCandidate,
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
  assert.deepEqual(rankOfficialMusicResults([cover, topic, vevo], query), [vevo, topic]);
  assert.equal(isMusicPlaybackCandidate(cover, "Post To Be cover"), true);
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


test("music playback filter rejects reaction, press conference and editorial videos", () => {
  const candidates = [
    { id: "song", title: "BigXthaPlug - 6WA (Official Visualizer)", channel: "BigXthaPlug" },
    { id: "audio", title: "6WA", channel: "BigXthaPlug - Topic" },
    { id: "press", title: "6WA Press Conference | Official Mixtape Announcement", channel: "BigXthaPlug" },
    { id: "reaction", title: "Rapper Reacts To BigXthaPlug - 6WA", channel: "Reaction Channel" },
    { id: "interview", title: "BigXthaPlug Interview About 6WA", channel: "Media" },
  ];
  assert.deepEqual(filterMusicPlaybackResults(candidates, "6wa").map((item) => item.id), ["song", "audio"]);
});

test("derivative versions only pass when explicitly requested", () => {
  const slowed = { id: "slow", title: "6WA (Slowed + Reverb)", channel: "Uploader" };
  assert.equal(isMusicPlaybackCandidate(slowed, "6wa"), false);
  assert.equal(isMusicPlaybackCandidate(slowed, "6wa slowed reverb"), true);
});
