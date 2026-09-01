import Genre from "@/models/Genre";
import Tag from "@/models/Tag";
import { MAJOR_GENRES, normalizeGenreName, slugifyGenre } from "@/utils/genreTaxonomy";

const SYSTEM_TAGS = [
  ["Chill", "mood", ["relaxed"]],
  ["Energetic", "mood", ["high energy"]],
  ["Melancholic", "mood", ["sad"]],
  ["Romantic", "mood", ["love"]],
  ["Focus", "mood", ["study"]],
  ["Party", "mood", []],
  ["Workout", "mood", ["fitness"]],
  ["Late Night", "mood", []],
  ["1960s", "era", ["60s"]],
  ["1970s", "era", ["70s"]],
  ["1980s", "era", ["80s"]],
  ["1990s", "era", ["90s"]],
  ["2000s", "era", ["00s"]],
  ["2010s", "era", ["10s"]],
  ["2020s", "era", ["20s"]],
  ["Underground", "scene", []],
  ["Mainstream", "scene", []],
  ["DIY", "scene", ["independent"]],
  ["Live", "production", []],
  ["Acoustic", "production", []],
  ["Lo-fi", "production", ["lofi"]],
  ["Instrumental", "instrumentation", []],
  ["Remix", "production", []],
  ["Explicit", "theme", []],
  ["English", "language", []],
  ["Spanish", "language", []],
  ["Arabic", "language", []],
  ["Hindi", "language", []],
  ["Korean", "language", []],
  ["Japanese", "language", []],
];

const globalCache = globalThis;
const cache = globalCache.__HeyKasaGenreCatalog || {
  genreSeedPromise: null,
  tagSeedPromise: null,
};

globalCache.__HeyKasaGenreCatalog = cache;

function systemGenreDocument(genre, parent = null) {
  const displayName = genre.name || genre;
  const aliases = genre.aliases || [];
  const rootSlug = parent ? parent.slug : genre.slug;
  const slug = parent
    ? `${rootSlug}--${slugifyGenre(displayName)}`
    : genre.slug;

  return {
    displayName,
    normalizedName: normalizeGenreName(displayName),
    slug,
    parentId: parent?._id || null,
    ancestorIds: parent ? [...(parent.ancestorIds || []), parent._id] : [],
    depth: parent ? parent.depth + 1 : 0,
    aliases,
    aliasKeys: aliases.map(normalizeGenreName),
    translations: { en: displayName },
    scope: "system",
    ownerId: null,
  };
}

async function seedSystemGenres() {
  await Genre.bulkWrite(MAJOR_GENRES.map((majorGenre) => ({
    updateOne: {
      filter: { slug: majorGenre.slug },
      update: { $setOnInsert: systemGenreDocument(majorGenre) },
      upsert: true,
    },
  })), { ordered: false });

  const roots = await Genre.find({
    slug: { $in: MAJOR_GENRES.map((genre) => genre.slug) },
  }).lean();
  const rootsBySlug = new Map(roots.map((genre) => [genre.slug, genre]));
  const childOperations = MAJOR_GENRES.flatMap((majorGenre) => {
    const root = rootsBySlug.get(majorGenre.slug);
    if (!root) throw new Error(`Missing root genre: ${majorGenre.slug}`);
    return majorGenre.subgenres.map((subgenre) => {
      const document = systemGenreDocument({ name: subgenre, aliases: [] }, root);
      return {
        updateOne: {
          filter: { slug: document.slug },
          update: { $setOnInsert: document },
          upsert: true,
        },
      };
    });
  });
  if (childOperations.length > 0) {
    await Genre.bulkWrite(childOperations, { ordered: false });
  }

  return Genre.find({ scope: "system" }).sort({ depth: 1, displayName: 1 }).lean();
}

async function seedSystemTags() {
  await Tag.bulkWrite(SYSTEM_TAGS.map(([displayName, category, aliases]) => ({
    updateOne: {
      filter: { slug: `tag-${slugifyGenre(displayName)}` },
      update: {
        $setOnInsert: {
          displayName,
          normalizedName: normalizeGenreName(displayName),
          slug: `tag-${slugifyGenre(displayName)}`,
          category,
          aliases,
          aliasKeys: aliases.map(normalizeGenreName),
          translations: { en: displayName },
          scope: "system",
          ownerId: null,
        },
      },
      upsert: true,
    },
  })), { ordered: false });

  return Tag.find({ scope: "system" }).sort({ category: 1, displayName: 1 }).lean();
}

export async function ensureSystemGenres() {
  if (!cache.genreSeedPromise) {
    cache.genreSeedPromise = seedSystemGenres().catch((error) => {
      cache.genreSeedPromise = null;
      throw error;
    });
  }
  return cache.genreSeedPromise;
}

export async function ensureSystemTags() {
  if (!cache.tagSeedPromise) {
    cache.tagSeedPromise = seedSystemTags().catch((error) => {
      cache.tagSeedPromise = null;
      throw error;
    });
  }
  return cache.tagSeedPromise;
}

export function catalogDisplayName(document, locale) {
  if (!locale) return document.displayName;
  const normalizedLocale = locale.toLowerCase();
  const translations = document.translations || {};
  return translations[normalizedLocale]
    || translations[normalizedLocale.split("-")[0]]
    || document.displayName;
}

export function toCatalogItem(document, locale) {
  return {
    id: document._id.toString(),
    name: catalogDisplayName(document, locale),
    defaultName: document.displayName,
    slug: document.slug,
    parentId: document.parentId?.toString() || null,
    depth: document.depth || 0,
    aliases: document.aliases || [],
    scope: document.scope,
  };
}