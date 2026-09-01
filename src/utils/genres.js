export const GENRE_CATALOG = [
  {
    id: "pop",
    name: "Pop",
    aliases: ["popular", "top 40"],
    subgenres: ["Dance Pop", "Indie Pop", "Synth Pop", "K-Pop", "Teen Pop", "Electropop"],
  },
  {
    id: "rock",
    name: "Rock",
    aliases: ["guitar", "alt rock"],
    subgenres: ["Indie Rock", "Classic Rock", "Punk Rock", "Alternative Rock", "Soft Rock", "Metal"],
  },
  {
    id: "hip-hop",
    name: "Hip-Hop / Rap",
    aliases: ["hip hop", "hiphop", "rap", "hip-hop"],
    subgenres: ["Trap", "Boom Bap", "Lo-fi Hip Hop", "Drill", "Old School Rap", "R&B Rap"],
  },
  {
    id: "electronic",
    name: "Electronic",
    aliases: ["edm", "dance", "electro"],
    subgenres: ["House", "Techno", "Drum & Bass", "Dubstep", "Ambient", "Trance"],
  },
  {
    id: "rnb",
    name: "R&B",
    aliases: ["rnb", "rhythm and blues", "r and b"],
    subgenres: ["Contemporary R&B", "Neo Soul", "Quiet Storm", "New Jack Swing"],
  },
  {
    id: "jazz",
    name: "Jazz",
    aliases: [],
    subgenres: ["Smooth Jazz", "Bebop", "Jazz Fusion", "Vocal Jazz", "Lo-fi Jazz"],
  },
  {
    id: "classical",
    name: "Classical",
    aliases: ["orchestra", "piano classical"],
    subgenres: ["Baroque", "Romantic", "Contemporary Classical", "Film Score", "Opera"],
  },
  {
    id: "country",
    name: "Country",
    aliases: [],
    subgenres: ["Modern Country", "Americana", "Country Pop", "Outlaw Country"],
  },
  {
    id: "latin",
    name: "Latin",
    aliases: ["reggaeton", "salsa"],
    subgenres: ["Reggaeton", "Salsa", "Bachata", "Latin Pop", "Cumbia"],
  },
  {
    id: "indie",
    name: "Indie",
    aliases: ["alternative", "alt"],
    subgenres: ["Indie Folk", "Indie Electronic", "Dream Pop", "Shoegaze"],
  },
  {
    id: "reggae",
    name: "Reggae",
    aliases: ["ska"],
    subgenres: ["Dancehall", "Roots Reggae", "Dub", "Ska"],
  },
  {
    id: "blues",
    name: "Blues",
    aliases: [],
    subgenres: ["Chicago Blues", "Delta Blues", "Blues Rock", "Soul Blues"],
  },
  {
    id: "folk",
    name: "Folk",
    aliases: ["acoustic"],
    subgenres: ["Indie Folk", "Folk Rock", "Singer-Songwriter", "Celtic"],
  },
  {
    id: "metal",
    name: "Metal",
    aliases: ["heavy metal"],
    subgenres: ["Heavy Metal", "Metalcore", "Thrash", "Doom Metal"],
  },
  {
    id: "punk",
    name: "Punk",
    aliases: [],
    subgenres: ["Pop Punk", "Hardcore Punk", "Post-Punk", "Emo"],
  },
  {
    id: "kpop",
    name: "K-Pop",
    aliases: ["kpop", "k pop"],
    subgenres: ["K-R&B", "K-Hip Hop", "K-Ballad", "J-Pop"],
  },
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

export const GENRE_OPTIONS = GENRE_CATALOG.flatMap((genre) => [
  genre.name,
  ...genre.subgenres,
]);

export const PRIMARY_GENRE_NAMES = GENRE_CATALOG.map((genre) => genre.name);

export const DEFAULT_GENRES = ["Pop", "Rock", "Hip-Hop / Rap", "Electronic"];

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
    if (genreBlob.includes(needle) || needle.includes(normalize(genre.name))) {
      results.push({
        ...genre,
        matchType: "genre",
        matchLabel: genre.name,
      });
    }
    for (const sub of genre.subgenres) {
      const subNorm = normalize(sub);
      if (subNorm.includes(needle) || needle.includes(subNorm)) {
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
