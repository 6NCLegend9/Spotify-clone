import { normalizeGenreName } from "./genreNormalization.mjs";

export const DEFAULT_GENRES = [
  "Pop",
  "Rock",
  "Hip Hop & Rap",
  "Electronic & Dance",
];

export function buildGenreSeeds(profile) {
  const genres = profile?.genres?.length ? profile.genres : DEFAULT_GENRES;
  return genres.slice(0, 3).map((genre) => ({
    query: genre,
    reason: `Based on your ${genre} taste`,
    genre,
  }));
}

function addSeed(seeds, seen, query, reason, extra = {}) {
  const normalized = typeof query === "string" ? query.trim() : "";
  const key = normalized.toLowerCase();
  if (!normalized || seen.has(key) || seeds.length >= 3) return;
  seen.add(key);
  seeds.push({ query: normalized, reason, ...extra });
}

export function resolveRecommendationPlan(mode, profile, options) {
  if (mode === "personalized") {
    return {
      kind: "personalized",
      seeds: buildPersonalizedSeeds(profile, options),
    };
  }

  return {
    kind: "popular",
    seeds: [],
  };
}

export function buildPersonalizedSeeds(profile, { rotation = 0 } = {}) {
  const seeds = [];
  const seen = new Set();
  const savedGenres = (profile?.genres || []).filter(
    (genre) => typeof genre === "string" && genre.trim(),
  );
  const privateSession = profile?.settings?.privateSession === true;

  // Rotate both signal families and their members so long follow lists cannot
  // permanently crowd out recent listening, searches, or later saved genres.
  const pools = [
    savedGenres.map((genre) => ({ query: genre, reason: `Based on your ${genre} taste`, genre })),
    (profile?.followedArtists || []).map((artist) => ({ query: artist, reason: `Because you follow ${artist}` })),
    privateSession ? [] : (profile?.songHistory || []).map((song) => ({ query: song?.channel, reason: `Because you listened to ${song?.channel}` })),
    privateSession ? [] : [...(profile?.searches || [])].reverse().map((term) => ({ query: term, reason: `Because you searched for ${term}` })),
  ].map((pool) => {
    const keys = new Set();
    return pool.filter((seed) => {
      const key = typeof seed.query === "string" ? seed.query.trim().toLowerCase() : "";
      if (!key || keys.has(key)) return false;
      keys.add(key);
      return true;
    });
  }).filter((pool) => pool.length);
  const offset = Number.isSafeInteger(rotation) ? Math.abs(rotation) : 0;
  const orderedPools = pools.map((_, index) => pools[(index + offset) % pools.length]);
  for (let round = 0; round < Math.max(0, ...pools.map((pool) => pool.length)) && seeds.length < 3; round += 1) {
    orderedPools.forEach((pool) => {
      if (round >= pool.length) return;
      const seed = pool[(round + Math.floor(offset / pools.length)) % pool.length];
      addSeed(seeds, seen, seed.query, seed.reason, seed.genre ? { genre: seed.genre } : {});
    });
  }

  return seeds.length ? seeds : buildPersonalizedSeeds({ genres: DEFAULT_GENRES }, { rotation });
}

export function resolveGenrePreferences(values, catalog) {
  const genresByKey = new Map();
  catalog.forEach((genre) => {
    [genre.normalizedName, ...(genre.aliasKeys || [])].forEach((key) => {
      if (key && !genresByKey.has(key)) genresByKey.set(key, genre);
    });
  });

  const seen = new Set();
  return values.reduce((preferences, value) => {
    const displayName = value.trim().replace(/\s+/g, " ");
    const normalizedName = normalizeGenreName(displayName);
    if (!normalizedName || seen.has(normalizedName)) return preferences;

    const genre = genresByKey.get(normalizedName);
    const resolvedName = genre?.displayName || displayName;
    const resolvedKey = normalizeGenreName(resolvedName);
    if (seen.has(resolvedKey)) return preferences;
    seen.add(resolvedKey);
    preferences.push({ name: resolvedName, id: genre?._id });
    return preferences;
  }, []);
}
