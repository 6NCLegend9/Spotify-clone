import assert from "node:assert/strict";
import test from "node:test";

import {
  MOOD_PROFILES,
  RADIO_MOODS,
  applyMoodFilter,
  buildRadioQueue,
  parseDurationSeconds,
  parseViews,
  spreadByArtist,
  trackId,
} from "../src/utils/radioEngine.mjs";

const track = (id, title, channel, genre = "") => ({ id, title, channel, genre });

test("mood ids stay aligned with the mood-radio pill presets", () => {
  assert.deepEqual(RADIO_MOODS, ["chill", "workout", "focus", "party", "energy"]);
  assert.ok(MOOD_PROFILES.workout.keywords.includes("gym"));
});

test("trackId tolerates string, object, and videoId shapes", () => {
  assert.equal(trackId({ id: "abc" }), "abc");
  assert.equal(trackId({ id: { videoId: "xyz" } }), "xyz");
  assert.equal(trackId({ videoId: "vid" }), "vid");
  assert.equal(trackId(null), null);
});

test("buildRadioQueue dedupes by id and excludes the seed", () => {
  const seed = track("seed", "Seed Song", "SeedArtist", "rap");
  const queue = buildRadioQueue({
    seedTrack: seed,
    candidates: [
      seed,
      track("a", "A", "SeedArtist", "rap"),
      track("a", "A duplicate", "SeedArtist", "rap"),
      track("b", "B", "Other", "rap"),
      { id: null, title: "no id" },
    ],
    varietyLevel: "low",
  });
  const ids = queue.map((item) => item.id);
  assert.ok(!ids.includes("seed"), "seed excluded from up-next");
  assert.equal(ids.filter((id) => id === "a").length, 1, "duplicate id collapsed");
  assert.deepEqual([...ids].sort(), ["a", "b"]);
});

test("selectionDepth 'familiar' ranks the same-artist track first; 'deep-dives' pushes it down", () => {
  const seed = track("seed", "Seed", "SeedArtist", "rap");
  const candidates = [
    track("same", "Same Artist Hit", "SeedArtist", "rap"),
    track("genre", "Different Artist", "OtherArtist", "rap"),
    track("far", "Unrelated", "Jazzman", "jazz"),
  ];

  const familiar = buildRadioQueue({ seedTrack: seed, candidates, selectionDepth: "familiar", varietyLevel: "low" });
  const deep = buildRadioQueue({ seedTrack: seed, candidates, selectionDepth: "deep-dives", varietyLevel: "low" });

  assert.equal(familiar[0].id, "same", "familiar leads with the same-artist hit");
  const deepSameIndex = deep.findIndex((item) => item.id === "same");
  const deepGenreIndex = deep.findIndex((item) => item.id === "genre");
  assert.ok(deepGenreIndex < deepSameIndex, "deep-dives favours a novel same-genre artist over the obvious hit");
});

test("varietyLevel 'high' separates same-artist tracks that 'low' keeps clustered", () => {
  const clustered = [
    track("a1", "A one", "Artist A"),
    track("a2", "A two", "Artist A"),
    track("b1", "B one", "Artist B"),
    track("b2", "B two", "Artist B"),
    track("c1", "C one", "Artist C"),
    track("c2", "C two", "Artist C"),
  ];

  const spread = spreadByArtist(clustered, "high");
  for (let i = 1; i < spread.length; i += 1) {
    assert.notEqual(spread[i].channel, spread[i - 1].channel, "no adjacent same-artist under high variety");
  }

  const low = spreadByArtist(clustered, "low");
  assert.deepEqual(low.map((item) => item.id), clustered.map((item) => item.id), "low variety preserves input order");
});

test("applyMoodFilter boosts mood matches and pins the now-playing track", () => {
  const head = track("head", "Now Playing", "SeedArtist");
  const queue = [
    head,
    track("calm", "Lofi chill sleep beats", "Chillhop"),
    track("gym", "Beast Mode Gym Workout Pump", "HypeMax"),
  ];

  const result = applyMoodFilter(queue, "workout", { seedTrack: head });
  assert.equal(result[0].id, "head", "current track stays at the head");
  const gymIndex = result.findIndex((item) => item.id === "gym");
  const calmIndex = result.findIndex((item) => item.id === "calm");
  assert.ok(gymIndex < calmIndex, "workout tracks rise above chill tracks");
});

test("applyMoodFilter with no mood keeps stable order behind the head", () => {
  const head = track("head", "Now Playing", "SeedArtist");
  const queue = [head, track("x", "X", "A"), track("y", "Y", "B")];
  const result = applyMoodFilter(queue, null, { seedTrack: head });
  assert.deepEqual(result.map((item) => item.id), ["head", "x", "y"]);
});

test("buildRadioQueue respects the limit and never throws on junk input", () => {
  const many = Array.from({ length: 40 }, (_, i) => track(`t${i}`, `Track ${i}`, `Artist ${i % 5}`, "pop"));
  const limited = buildRadioQueue({ candidates: many, limit: 10 });
  assert.equal(limited.length, 10);

  assert.deepEqual(buildRadioQueue({ candidates: null }), []);
  assert.deepEqual(buildRadioQueue({}), []);
  assert.doesNotThrow(() => buildRadioQueue({ candidates: [{}, { id: null }, { id: "ok" }] }));
  assert.deepEqual(applyMoodFilter(null, "chill"), []);
});

test("parseDurationSeconds handles ISO-8601, clock, and numeric forms", () => {
  assert.equal(parseDurationSeconds({ duration: "PT3M45S" }), 225);
  assert.equal(parseDurationSeconds({ duration: "PT1H2M3S" }), 3723);
  assert.equal(parseDurationSeconds({ duration: "1:05" }), 65);
  assert.equal(parseDurationSeconds({ duration: 90 }), 90);
  assert.equal(parseDurationSeconds({}), 0);
});

test("parseViews handles compact strings and raw numbers", () => {
  assert.equal(parseViews({ views: "1.2M views" }), 1_200_000);
  assert.equal(parseViews({ views: "12,345 views" }), 12_345);
  assert.equal(parseViews({ viewCount: 5000 }), 5000);
  assert.equal(parseViews({ views: "abc" }), 0);
  assert.equal(parseViews({}), 0);
});
