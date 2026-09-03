import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_GENRES,
  buildGenreSeeds,
  buildPersonalizedSeeds,
  resolveGenrePreferences,
  resolveRecommendationPlan,
} from "../src/utils/recommendationSeeds.mjs";
import { normalizeGenreName } from "../src/utils/genreNormalization.mjs";

test("guest recommendations use popular music instead of taste seeds", () => {
  assert.deepEqual(resolveRecommendationPlan("guest", null), {
    kind: "popular",
    seeds: [],
  });
  assert.deepEqual(
    resolveRecommendationPlan("guest", {
      genres: ["Jazz"],
      songHistory: [{ channel: "Guest history artist" }],
    }),
    {
      kind: "popular",
      seeds: [],
    },
  );
});

test("signed-in users without taste still fall back to default genre seeds", () => {
  assert.deepEqual(
    buildGenreSeeds(null).map((seed) => seed.genre),
    DEFAULT_GENRES.slice(0, 3),
  );
  const plan = resolveRecommendationPlan("personalized", {});
  assert.equal(plan.kind, "personalized");
  assert.deepEqual(
    plan.seeds.map((seed) => seed.genre),
    DEFAULT_GENRES.slice(0, 3),
  );
});

test("private sessions reserve the primary genre and ignore activity", () => {
  const seeds = buildPersonalizedSeeds({
    genres: ["Jazz", "Rock"],
    followedArtists: ["Nina Simone"],
    songHistory: [{ channel: "Private history artist" }],
    searches: ["private search"],
    settings: { privateSession: true },
  });

  assert.equal(seeds[0].genre, "Jazz");
  assert.deepEqual(
    seeds.map((seed) => seed.query),
    ["Jazz", "Nina Simone", "Rock"],
  );
  assert.ok(seeds.every((seed) => !/private/i.test(seed.query)));
});

test("genre normalization and catalog aliases resolve to canonical preferences", () => {
  assert.equal(normalizeGenreName("  R&B — Sóul  "), "r and b soul");

  const preferences = resolveGenrePreferences(
    ["hip-hop", " Hip Hop & Rap ", "Indie"],
    [
      {
        _id: "genre-1",
        displayName: "Hip Hop & Rap",
        normalizedName: "hip hop and rap",
        aliasKeys: ["hip hop", "rap"],
      },
    ],
  );

  assert.deepEqual(preferences, [
    { name: "Hip Hop & Rap", id: "genre-1" },
    { name: "Indie", id: undefined },
  ]);
});
