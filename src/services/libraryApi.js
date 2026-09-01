const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export function validYouTubeIds(values = []) {
  return [...new Set(values.filter((value) => typeof value === "string" && YOUTUBE_ID_PATTERN.test(value)))];
}

const TRACK_CACHE_KEY = "HeyKasa-track-cache-v1";
const TRACK_CACHE_TTL_MS = 30 * 60 * 1000;

function readTrackCache() {
  try {
    const raw = sessionStorage.getItem(TRACK_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeTrackCache(cache) {
  try {
    sessionStorage.setItem(TRACK_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Storage may be unavailable.
  }
}

export async function hydrateYouTubeTracks(values = []) {
  const ids = validYouTubeIds(values);
  if (ids.length === 0) return [];
  const cache = typeof window === "undefined" ? {} : readTrackCache();
  const now = Date.now();
  const missing = [];
  const hydrated = [];

  ids.forEach((id) => {
    const cached = cache[id];
    if (cached?.track && cached.expiresAt > now) {
      hydrated.push(cached.track);
    } else {
      missing.push(id);
    }
  });

  if (missing.length === 0) {
    const byId = new Map(hydrated.map((track) => [track.id, track]));
    return ids.map((id) => byId.get(id)).filter(Boolean);
  }

  const batches = [];
  for (let index = 0; index < missing.length; index += 50) {
    batches.push(missing.slice(index, index + 50));
  }

  const responses = await Promise.all(
    batches.map(async (batch) => {
      const params = new URLSearchParams();
      batch.forEach((id) => params.append("id", id));
      const response = await fetch(`/api/youtube-videos?${params}`);
      if (!response.ok) throw new Error("Saved tracks could not be loaded.");
      const data = await response.json();
      return data.tracks || [];
    }),
  );

  const fetched = responses.flat();
  fetched.forEach((track) => {
    cache[track.id] = { track, expiresAt: now + TRACK_CACHE_TTL_MS };
  });
  if (typeof window !== "undefined") writeTrackCache(cache);

  const tracksById = new Map([
    ...hydrated.map((track) => [track.id, track]),
    ...fetched.map((track) => [track.id, track]),
  ]);
  return ids.map((id) => tracksById.get(id)).filter(Boolean);
}

export async function getFavouriteLibrary() {
  const response = await fetch("/api/favourite");
  if (!response.ok) throw new Error("Liked Songs could not be loaded.");
  const data = await response.json();
  return data.data || { favourites: [], favouriteAddedAt: {} };
}

export async function getPublicLibrary() {
  const response = await fetch("/api/recommendations");
  if (!response.ok) throw new Error("Featured playlists could not be loaded.");
  return response.json();
}

export function valueFromDateMap(dateMap, id) {
  if (!dateMap) return null;
  if (dateMap instanceof Map) return dateMap.get(id) || null;
  return dateMap[id] || null;
}