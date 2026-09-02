import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_GENRES,
  buildGenreSeeds,
  buildPersonalizedSeeds,
  resolveGenrePreferences,
} from "../src/utils/recommendationSeeds.mjs";
import { normalizeGenreName } from "../src/utils/genreNormalization.mjs";

test("guest recommendation seeds use the shared defaults", () => {
  assert.deepEqual(
    buildGenreSeeds(null).map((seed) => seed.genre),
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
