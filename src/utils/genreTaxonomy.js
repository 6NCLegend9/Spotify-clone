export const MAX_GENRE_DEPTH = 3;

export const MAJOR_GENRES = [
  {
    slug: "pop",
    name: "Pop",
    definition: "Melody-forward popular music built around concise songs and broad accessibility.",
    aliases: ["popular music"],
    subgenres: ["Dance Pop", "Electropop", "Synth-pop", "Teen Pop", "Art Pop", "Indie Pop"],
  },
  {
    slug: "rock",
    name: "Rock",
    definition: "Guitar-led music rooted in rock and roll, from radio rock to experimental guitar styles.",
    aliases: ["rock and roll"],
    subgenres: ["Alternative Rock", "Classic Rock", "Hard Rock", "Progressive Rock", "Garage Rock", "Psychedelic Rock"],
  },
  {
    slug: "hip-hop-rap",
    name: "Hip Hop & Rap",
    definition: "Rhythm-led music centered on rap vocals, beatmaking, DJ culture, and hip-hop scenes.",
    aliases: ["hip hop", "hip-hop", "rap", "hiphop"],
    subgenres: ["Boom Bap", "Trap", "Drill", "Conscious Hip Hop", "Cloud Rap", "Lo-fi Hip Hop"],
  },
  {
    slug: "electronic-dance",
    name: "Electronic & Dance",
    definition: "Music primarily made with electronic production techniques, including club and ambient forms.",
    aliases: ["electronic", "edm", "dance music"],
    subgenres: ["House", "Techno", "Trance", "Drum & Bass", "Dubstep", "Ambient"],
  },
  {
    slug: "rnb-soul",
    name: "R&B & Soul",
    definition: "Vocal-centered Black American music traditions spanning rhythm and blues, soul, and funk.",
    aliases: ["r&b", "rnb", "rhythm and blues", "soul"],
    subgenres: ["Contemporary R&B", "Neo Soul", "Funk", "Motown", "Quiet Storm", "Gospel"],
  },
  {
    slug: "jazz",
    name: "Jazz",
    definition: "Improvisation-centered music with roots in African American musical traditions.",
    aliases: [],
    subgenres: ["Bebop", "Swing", "Cool Jazz", "Jazz Fusion", "Free Jazz", "Smooth Jazz"],
  },
  {
    slug: "classical-orchestral",
    name: "Classical & Orchestral",
    definition: "Composed concert music, orchestral works, opera, and related contemporary traditions.",
    aliases: ["classical"],
    subgenres: ["Baroque", "Romantic", "Chamber Music", "Opera", "Contemporary Classical", "Film Score"],
  },
  {
    slug: "country",
    name: "Country",
    definition: "Song-driven music rooted in North American rural and roots traditions.",
    aliases: [],
    subgenres: ["Traditional Country", "Country Pop", "Americana", "Bluegrass", "Outlaw Country", "Alt-Country"],
  },
  {
    slug: "folk-acoustic",
    name: "Folk & Acoustic",
    definition: "Acoustic and roots-oriented songwriting connected to folk traditions and singer-songwriters.",
    aliases: ["folk", "acoustic"],
    subgenres: ["Contemporary Folk", "Singer-Songwriter", "Indie Folk", "Celtic Folk", "American Roots", "Acoustic"],
  },
  {
    slug: "metal",
    name: "Metal",
    definition: "Amplified, high-intensity guitar music with heavy riffs and distinctive subcultural scenes.",
    aliases: ["heavy metal"],
    subgenres: ["Heavy Metal", "Thrash Metal", "Death Metal", "Black Metal", "Doom Metal", "Power Metal"],
  },
  {
    slug: "punk-hardcore",
    name: "Punk & Hardcore",
    definition: "Fast, direct and DIY-oriented guitar music spanning punk and hardcore communities.",
    aliases: ["punk", "hardcore"],
    subgenres: ["Punk Rock", "Hardcore Punk", "Post-Punk", "Pop Punk", "Emo", "Ska Punk"],
  },
  {
    slug: "blues",
    name: "Blues",
    definition: "Music rooted in blues forms, expressive vocals, and guitar or piano traditions.",
    aliases: [],
    subgenres: ["Delta Blues", "Chicago Blues", "Electric Blues", "Blues Rock", "Piedmont Blues", "Modern Blues"],
  },
  {
    slug: "reggae-caribbean",
    name: "Reggae & Caribbean",
    definition: "Caribbean music traditions from Jamaica and the wider region, including sound-system culture.",
    aliases: ["reggae", "caribbean"],
    subgenres: ["Roots Reggae", "Dancehall", "Dub", "Ska", "Rocksteady", "Soca"],
  },
  {
    slug: "latin",
    name: "Latin",
    definition: "Music from Latin America and its diasporas, across Spanish, Portuguese, and Indigenous traditions.",
    aliases: ["latin music"],
    subgenres: ["Reggaeton", "Salsa", "Bachata", "Cumbia", "Latin Pop", "Regional Mexican"],
  },
  {
    slug: "african",
    name: "African",
    definition: "Contemporary and traditional music from African regions and diasporas.",
    aliases: ["african music"],
    subgenres: ["Afrobeats", "Highlife", "Amapiano", "Afro-house", "Benga", "Mbalax"],
  },
  {
    slug: "middle-east-north-africa",
    name: "Middle Eastern & North African",
    definition: "Music from the Middle East and North Africa, including Arabic, Persian, Turkish, and regional traditions.",
    aliases: ["mena", "middle eastern"],
    subgenres: ["Arabic Pop", "Rai", "Khaliji", "Dabke", "Persian Pop", "Turkish Pop"],
  },
  {
    slug: "south-asian",
    name: "South Asian",
    definition: "Music from South Asia and its diaspora, spanning classical, film, pop, and regional traditions.",
    aliases: ["south asian music"],
    subgenres: ["Bollywood", "Indian Classical", "Bhangra", "Carnatic", "Hindustani", "Pakistani Pop"],
  },
  {
    slug: "east-southeast-asian",
    name: "East & Southeast Asian",
    definition: "Contemporary and traditional music from East and Southeast Asia and related diasporas.",
    aliases: ["asian music", "east asian"],
    subgenres: ["K-pop", "J-pop", "Mandopop", "C-pop", "City Pop", "P-pop"],
  },
  {
    slug: "world-traditional",
    name: "World & Traditional",
    definition: "Traditional, regional, and culturally specific music that does not fit a narrower top-level branch.",
    aliases: ["world music", "traditional music"],
    subgenres: ["Balkan Folk", "Celtic", "Fado", "Flamenco", "Qawwali", "Indigenous Music"],
  },
  {
    slug: "experimental-avant-garde",
    name: "Experimental & Avant-Garde",
    definition: "Boundary-pushing music that prioritizes unconventional form, sound design, or composition.",
    aliases: ["experimental", "avant garde", "avant-garde"],
    subgenres: ["Avant-Garde", "Noise", "Musique Concrete", "Minimalism", "Industrial", "Glitch"],
  },
];

export function normalizeGenreName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[\u2018\u2019']/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function slugifyGenre(value) {
  return normalizeGenreName(value).replace(/\s+/g, "-");
}

export function resolveMajorGenre(value) {
  const normalized = normalizeGenreName(value);
  return MAJOR_GENRES.find((genre) =>
    [genre.name, genre.slug, ...genre.aliases].some((candidate) => normalizeGenreName(candidate) === normalized),
  ) || null;
}