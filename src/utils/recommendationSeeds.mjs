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

export function buildPersonalizedSeeds(profile) {
  const seeds = [];
  const seen = new Set();
  const savedGenres = (profile?.genres || []).filter(
    (genre) => typeof genre === "string" && genre.trim(),
  );
  const privateSession = profile?.settings?.privateSession === true;

  if (savedGenres.length > 0) {
    addSeed(
      seeds,
      seen,
      savedGenres[0],
      `Based on your ${savedGenres[0]} taste`,
      { genre: savedGenres[0] },
    );
  }
  (profile?.followedArtists || []).forEach((artist) => {
    addSeed(seeds, seen, artist, `Because you follow ${artist}`);
  });
  if (!privateSession) {
    (profile?.songHistory || []).forEach((song) => {
      const channel = typeof song?.channel === "string" ? song.channel : "";
      addSeed(seeds, seen, channel, `Because you listened to ${channel}`);
    });
    (profile?.searches || []).forEach((term) => {
      addSeed(seeds, seen, term, `Because you searched for ${term}`);
    });
  }
  savedGenres.slice(1).forEach((genre) => {
    addSeed(seeds, seen, genre, `Based on your ${genre} taste`, { genre });
  });

  return seeds.length ? seeds : buildGenreSeeds(null);
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
