export const PLAYLIST_CATEGORIES = [
  "Sports",
  "Workout",
  "Chill",
  "Party",
  "Romance",
  "Gaming",
  "Hip-Hop",
  "Pop",
  "Rock",
];

export const PLAYLIST_THEMES = {
  Sports: {
    label: "Sports",
    icon: "sports",
    gradient: "from-[#14532d] via-[#16a34a] to-[#f59e0b]",
    accent: "#4ade80",
    hint: "Game-day energy",
  },
  Workout: {
    label: "Workout",
    icon: "workout",
    gradient: "from-[#7f1d1d] via-[#dc2626] to-[#f97316]",
    accent: "#fb7185",
    hint: "Gym and cardio",
  },
  Chill: {
    label: "Chill / Focus",
    icon: "chill",
    gradient: "from-[#0f766e] via-[#155e75] to-[#1e3a5f]",
    accent: "#67e8f9",
    hint: "Calm and focus",
  },
  Party: {
    label: "Party / Energy",
    icon: "party",
    gradient: "from-[#6d28d9] via-[#db2777] to-[#f59e0b]",
    accent: "#f472b6",
    hint: "High energy",
  },
  Romance: {
    label: "Romance / Calm",
    icon: "romance",
    gradient: "from-[#9f1239] via-[#be185d] to-[#fb7185]",
    accent: "#fda4af",
    hint: "Soft and warm",
  },
  Gaming: {
    label: "Gaming",
    icon: "gaming",
    gradient: "from-[#1e1b4b] via-[#4c1d95] to-[#22d3ee]",
    accent: "#818cf8",
    hint: "Play session",
  },
  "Hip-Hop": {
    label: "Hip-Hop / Rap",
    icon: "hiphop",
    gradient: "from-[#111827] via-[#334155] to-[#fbbf24]",
    accent: "#facc15",
    hint: "Bars and beats",
  },
  Pop: {
    label: "Pop",
    icon: "pop",
    gradient: "from-[#0e7490] via-[#2563eb] to-[#ec4899]",
    accent: "#38bdf8",
    hint: "Catchy hits",
  },
  Rock: {
    label: "Rock",
    icon: "rock",
    gradient: "from-[#1c1917] via-[#7c2d12] to-[#e11d48]",
    accent: "#fb7185",
    hint: "Guitars up front",
  },
};

const CATEGORY_ALIASES = {
  sport: "Sports",
  sports: "Sports",
  workout: "Workout",
  fitness: "Workout",
  gym: "Workout",
  chill: "Chill",
  focus: "Chill",
  lofi: "Chill",
  "lo-fi": "Chill",
  party: "Party",
  energy: "Party",
  romance: "Romance",
  calm: "Romance",
  love: "Romance",
  gaming: "Gaming",
  game: "Gaming",
  "hip-hop": "Hip-Hop",
  hiphop: "Hip-Hop",
  rap: "Hip-Hop",
  pop: "Pop",
  rock: "Rock",
};

export function normalizePlaylistCategory(value) {
  if (typeof value !== "string") return "Pop";
  const trimmed = value.trim();
  if (PLAYLIST_THEMES[trimmed]) return trimmed;
  const alias = CATEGORY_ALIASES[trimmed.toLowerCase()];
  return alias || "Pop";
}

export function getPlaylistTheme(category) {
  return PLAYLIST_THEMES[normalizePlaylistCategory(category)] || PLAYLIST_THEMES.Pop;
}

const CATEGORY_RULES = [
  ["Sports", /sport|nfl|nba|soccer|football|stadium|game day|hype mix/],
  ["Workout", /workout|gym|fitness|cardio|running|hiit|pump/],
  ["Gaming", /gaming|gamer|esport|game ost|pixel/],
  ["Party", /party|club|banger|festival|dance floor|electronic|edm|techno|house|dance/],
  ["Romance", /romance|love|romantic|date night|slow jam/],
  ["Chill", /chill|focus|lofi|lo-fi|study|sleep|calm|ambient/],
  ["Hip-Hop", /hip.?hop|rap|trap|drill/],
  ["Rock", /rock|metal|punk|guitar/],
  ["Pop", /pop|top 40|hits/],
];

// Returns the best-matching category for free text, or null when nothing matches.
export function matchPlaylistCategory(text = "") {
  const value = String(text).toLowerCase();
  for (const [category, pattern] of CATEGORY_RULES) {
    if (pattern.test(value)) return category;
  }
  return null;
}

export function inferPlaylistCategory(name = "", fallback = "Pop") {
  return matchPlaylistCategory(name) || normalizePlaylistCategory(fallback);
}

// Derives a playlist category from a listener's saved genres, or null when none map cleanly.
export function categoryFromGenres(genres = []) {
  const list = Array.isArray(genres) ? genres : [];
  return matchPlaylistCategory(list.join(" "));
}

// Search seeds used to auto-fill a freshly created playlist with on-genre tracks.
export const PLAYLIST_SEED_QUERIES = {
  Sports: ["stadium hype anthems", "game day pump up songs", "sports motivation mix"],
  Workout: ["workout motivation songs", "gym pump up mix", "cardio hiit music"],
  Chill: ["lofi chill beats", "calm focus music", "chillout ambient mix"],
  Party: ["party dance hits", "club bangers", "festival edm anthems"],
  Romance: ["romantic love songs", "slow jams playlist", "r&b date night"],
  Gaming: ["gaming music mix", "electronic gaming beats", "esports hype songs"],
  "Hip-Hop": ["hip hop hits", "rap bangers", "trap mix"],
  Pop: ["top pop hits", "pop songs playlist", "top 40 hits"],
  Rock: ["rock anthems", "classic rock hits", "alternative rock mix"],
};

export function isCoverDataUrl(value) {
  return typeof value === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(value) && value.length <= 320_000;
}

export function serializePlaylist(playlist, userId) {
  if (!playlist) return null;
  const obj = typeof playlist.toObject === "function" ? playlist.toObject({ flattenMaps: true }) : { ...playlist };
  const likedBy = Array.isArray(obj.likedBy) ? obj.likedBy.map(String) : [];
  const category = normalizePlaylistCategory(obj.category);
  return {
    ...obj,
    category,
    likedBy: undefined,
    liked: userId ? likedBy.includes(String(userId)) : false,
    likesCount: likedBy.length,
  };
}
