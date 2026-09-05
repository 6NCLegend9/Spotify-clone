import { MAJOR_GENRES } from "@/utils/genreTaxonomy";
import { DEFAULT_GENRES } from "./recommendationSeeds.mjs";

export { DEFAULT_GENRES };

const MOOD_CATALOG = [
  {
    id: "chill",
    name: "Chill / Focus",
    aliases: ["chill", "focus", "study", "lofi", "lo-fi", "lo fi"],
    subgenres: ["Lo-fi Chill", "Study Beats", "Focus Ambient", "Coffeehouse", "Downtempo"],
  },
  {
    id: "party",
    name: "Party / Energy",
    aliases: ["party", "energy", "bangers", "club"],
    subgenres: ["Club Hits", "Dance Energy", "Festival", "Throwback Party"],
  },
  {
    id: "romance",
    name: "Romance / Calm",
    aliases: ["romance", "love", "calm", "romantic"],
    subgenres: ["Love Songs", "Acoustic Romance", "Slow Jams", "Soft Pop"],
  },
  {
    id: "workout",
    name: "Workout / Fitness",
    aliases: ["workout", "fitness", "gym", "running", "cardio"],
    subgenres: ["Gym Pump", "Running", "HIIT", "Cardio Pop"],
  },
  {
    id: "sports",
    name: "Sports",
    aliases: ["sport", "game day", "stadium", "hype"],
    subgenres: ["Game Day", "Stadium Anthems", "Hype Mix", "Victory Laps"],
  },
  {
    id: "gaming",
    name: "Gaming",
    aliases: ["game", "esports", "gamer"],
    subgenres: ["Epic Gaming", "Chill Gaming", "Retro Games", "FPS Hype"],
  },
];

export const GENRE_CATALOG = [
  ...MAJOR_GENRES.map((genre) => ({
    id: genre.slug,
    name: genre.name,
    aliases: genre.aliases || [],
    subgenres: genre.subgenres || [],
  })),
  ...MOOD_CATALOG,
];

export const GENRE_OPTIONS = GENRE_CATALOG.flatMap((genre) => [
  genre.name,
  ...genre.subgenres,
]);

export const PRIMARY_GENRE_NAMES = GENRE_CATALOG.map((genre) => genre.name);

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function searchGenres(query, { limit = 24 } = {}) {
  const needle = normalize(query);
  if (!needle) {
    return GENRE_CATALOG.map((genre) => ({
      ...genre,
      matchType: "genre",
      matchLabel: genre.name,
    }));
  }

  const results = [];
  for (const genre of GENRE_CATALOG) {
    const genreBlob = normalize([genre.name, genre.id, ...(genre.aliases || [])].join(" "));
    // Only match when the query leads toward a genre name (e.g. "roc" -> Rock),
    // not when a genre word merely appears inside an artist query ("pop smoke").
    if (genreBlob.includes(needle)) {
      results.push({
        ...genre,
        matchType: "genre",
        matchLabel: genre.name,
      });
    }
    for (const sub of genre.subgenres) {
      const subNorm = normalize(sub);
      if (subNorm.includes(needle)) {
        results.push({
          ...genre,
          matchType: "subgenre",
          matchLabel: sub,
        });
      }
    }
  }

  const seen = new Set();
  return results.filter((item) => {
    const key = `${item.id}:${item.matchLabel}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
}

export function findGenreByName(name) {
  const needle = normalize(name);
  if (!needle) return null;
  for (const genre of GENRE_CATALOG) {
    if (normalize(genre.name) === needle || genre.id === needle) return { genre, subgenre: null };
    if ((genre.aliases || []).some((alias) => normalize(alias) === needle)) {
      return { genre, subgenre: null };
    }
    const sub = genre.subgenres.find((item) => normalize(item) === needle);
    if (sub) return { genre, subgenre: sub };
  }
  return null;
}

export function searchQueryForGenre(match) {
  if (!match) return "";
  return match.matchType === "subgenre" ? match.matchLabel : match.name;
}
