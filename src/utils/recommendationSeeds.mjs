import { normalizeGenreName } from "./genreNormalization.mjs";
import { MAJOR_GENRES } from "./genreTaxonomy.js";

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
  if (!normalized || seen.has(key) || seeds.length >= 2) return;
  seen.add(key);
  seeds.push({ query: normalized, reason, ...extra });
}

export function resolveRecommendationPlan(mode, profile, options) {
  if (mode === "personalized") {
    const seeds = buildPersonalizedSeeds(profile, options);
    return {
      kind: seeds.length ? "personalized" : "popular",
      seeds,
      explorationSeeds: buildExplorationSeeds(seeds, profile, options),
      basis: seeds[0]?.basis || "popular",
    };
  }

  return {
    kind: "popular",
    seeds: [],
    explorationSeeds: [],
    basis: "popular",
  };
}

export function buildPersonalizedSeeds(profile, { rotation = 0 } = {}) {
  const seeds = [];
  const seen = new Set();
  const savedGenres = (profile?.genres || []).filter(
    (genre) => typeof genre === "string" && genre.trim(),
  );
  const privateSession = profile?.settings?.privateSession === true;
  const artists = [...(profile?.followedArtists || []), ...(profile?.followedArtistsMeta || []).map((artist) => artist?.name)];
  const hasTaste = savedGenres.length > 0 || artists.some((artist) => typeof artist === "string" && artist.trim());

  // Saved taste leads. With no saved taste, recent listening and searches lead.
  // Rotate within each family so later genres/artists can also contribute.
  const pools = (hasTaste ? [
    savedGenres.map((genre) => ({ query: genre, reason: `Based on your ${genre} taste`, genre, basis: "taste", kind: "genre" })),
    artists.map((artist) => ({ query: artist, reason: `Because you follow ${artist}`, basis: "taste", kind: "artist" })),
  ] : privateSession ? [] : [
    (profile?.songHistory || []).slice(0, 20).map((song) => ({ query: song?.channel || song?.title || song?.name, reason: `Inspired by your recent listening`, basis: "activity", kind: song?.channel ? "artist" : "search" })),
    [...(profile?.searches || [])].slice(-10).reverse().map((term) => ({ query: term, reason: `Because you searched for ${term}`, basis: "activity", kind: "search" })),
  ]).map((pool) => {
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
  for (let round = 0; round < Math.max(0, ...pools.map((pool) => pool.length)) && seeds.length < 2; round += 1) {
    orderedPools.forEach((pool) => {
      if (round >= pool.length) return;
      const seed = pool[(round + Math.floor(offset / pools.length)) % pool.length];
      addSeed(seeds, seen, seed.query, seed.reason, { ...seed, query: seed.query.trim() });
    });
  }

  return seeds;
}

export function buildExplorationSeeds(seeds, profile, { rotation = 0 } = {}) {
  const saved = new Set((profile?.genres || []).map(normalizeGenreName));
  const offset = Number.isSafeInteger(rotation) ? Math.abs(rotation) : 0;
  return seeds.map((seed, index) => {
    const key = normalizeGenreName(seed.query);
    const family = MAJOR_GENRES.find((genre) => [genre.name, ...genre.aliases, ...genre.subgenres].some((name) => normalizeGenreName(name) === key));
    const styles = (family?.subgenres || []).filter((name) => !saved.has(normalizeGenreName(name)) && normalizeGenreName(name) !== key);
    const style = styles.length ? styles[(offset + index) % styles.length] : null;
    const query = style || `${seed.query} ${seed.kind === "artist" ? "similar artists songs" : "new music discoveries"}`;
    return {
      query,
      genre: style || seed.genre,
      reason: style ? `Explore ${style}, inspired by ${seed.query}` : `New discoveries inspired by ${seed.query}`,
      basis: seed.basis,
      kind: style ? "genre" : seed.kind,
      fresh: true,
      ...(seed.kind === "artist" ? { excludeArtist: seed.query } : {}),
    };
  });
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
