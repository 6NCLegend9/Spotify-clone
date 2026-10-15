import { displayName } from "./inputText.mjs";
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
    gradient: "from-[#096192] via-[#1171ba] to-[#1399c6]",
    accent: "#24aae2",
    hint: "Game-day energy",
  },
  Workout: {
    label: "Workout",
    icon: "workout",
    gradient: "from-[#1171ba] via-[#1399c6] to-[#24aae2]",
    accent: "#0e8c7f",
    hint: "Gym and cardio",
  },
  Chill: {
    label: "Chill / Focus",
    icon: "chill",
    gradient: "from-[#0e8c7f] via-[#1399c6] to-[#096192]",
    accent: "#24aae2",
    hint: "Calm and focus",
  },
  Party: {
    label: "Party / Energy",
    icon: "party",
    gradient: "from-[#24aae2] via-[#1399c6] to-[#1171ba]",
    accent: "#0e8c7f",
    hint: "High energy",
  },
  Romance: {
    label: "Romance / Calm",
    icon: "romance",
    gradient: "from-[#1399c6] via-[#0e8c7f] to-[#096192]",
    accent: "#24aae2",
    hint: "Soft and warm",
  },
  Gaming: {
    label: "Gaming",
    icon: "gaming",
    gradient: "from-[#096192] via-[#1171ba] to-[#24aae2]",
    accent: "#1399c6",
    hint: "Play session",
  },
  "Hip-Hop": {
    label: "Hip-Hop / Rap",
    icon: "hiphop",
    gradient: "from-[#0e8c7f] via-[#096192] to-[#1171ba]",
    accent: "#24aae2",
    hint: "Bars and beats",
  },
  Pop: {
    label: "Pop",
    icon: "pop",
    gradient: "from-[#1171ba] via-[#24aae2] to-[#1399c6]",
    accent: "#0e8c7f",
    hint: "Catchy hits",
  },
  Rock: {
    label: "Rock",
    icon: "rock",
    gradient: "from-[#096192] via-[#1171ba] to-[#1399c6]",
    accent: "#24aae2",
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
  if (Object.hasOwn(PLAYLIST_THEMES, trimmed)) return trimmed;
  const key = trimmed.toLowerCase();
  return Object.hasOwn(CATEGORY_ALIASES, key) ? CATEGORY_ALIASES[key] : "Pop";
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
  if (typeof value !== "string" || value.length > 320_000) return false;
  const match = value.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  return Boolean(match && match[2].length % 4 === 0);
}

export function serializePlaylist(playlist, userId) {
  if (!playlist) return null;
  const obj = typeof playlist.toObject === "function" ? playlist.toObject({ flattenMaps: true }) : { ...playlist };
  const likedBy = Array.isArray(obj.likedBy) ? obj.likedBy.map(String) : [];
  const category = normalizePlaylistCategory(obj.category);
  const publicUser = (user) => {
    if (!user) return null;
    if (typeof user !== "object" || !("userName" in user || "imageUrl" in user)) return user._id ?? user;
    return { _id: user._id, userName: user.userName, imageUrl: user.imageUrl };
  };
  return {
    _id: obj._id,
    name: displayName(obj.name, 80) || "Untitled playlist",
    description: typeof obj.description === "string" ? obj.description : "",
    songs: Array.isArray(obj.songs) ? obj.songs : [],
    songAddedAt: obj.songAddedAt || {},
    songDurations: obj.songDurations || {},
    user: publicUser(obj.user),
    collaborators: (obj.collaborators || []).map(publicUser),
    visibility: obj.visibility || "private",
    pinned: Boolean(obj.pinned),
    smartShuffle: Boolean(obj.smartShuffle),
    subgenre: obj.subgenre || "",
    coverImage: obj.coverImage || "",
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
    category,
    liked: userId ? likedBy.includes(String(userId)) : false,
    likesCount: likedBy.length,
  };
}
