import { requestJson } from "@/services/http";
import { toUserError } from "@/utils/userError";

const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export function validYouTubeIds(values = []) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((value) => typeof value === "string" && YOUTUBE_ID_PATTERN.test(value)))];
}

const TRACK_CACHE_KEY = "HayKasa-track-cache-v1";
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

function libraryLoadError(error, fallback) {
  const normalized = toUserError(error);
  return normalized.code === "UNAUTHORIZED"
    ? toUserError({ code: "UNAUTHORIZED", status: normalized.status })
    : toUserError(error, fallback);
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
      const data = await requestJson(`/api/youtube-videos?${params}`, {
        fallbackTitle: "Saved tracks unavailable",
        fallbackMessage: "We couldn’t load the tracks in this collection. Please try again.",
      });
      if (!data || !Array.isArray(data.tracks)) {
        throw toUserError(null, {
          fallbackCode: "INTERNAL_ERROR",
          title: "Saved tracks unavailable",
          message: "We couldn’t load the tracks in this collection. Please try again.",
        });
      }
      return data.tracks;
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
  const fallback = {
    fallbackCode: "INTERNAL_ERROR",
    title: "Liked Songs unavailable",
    message: "We couldn’t load your Liked Songs. Please try again.",
  };
  try {
    const data = await requestJson("/api/favourite", {
      fallbackTitle: fallback.title,
      fallbackMessage: fallback.message,
    });
    if (!data?.data || typeof data.data !== "object") {
      throw toUserError(null, fallback);
    }
    return {
      ...data.data,
      favourites: Array.isArray(data.data.favourites) ? data.data.favourites : [],
      favouriteAddedAt:
        data.data.favouriteAddedAt && typeof data.data.favouriteAddedAt === "object"
          ? data.data.favouriteAddedAt
          : {},
    };
  } catch (error) {
    throw libraryLoadError(error, fallback);
  }
}

export async function getPublicLibrary() {
  const data = await requestJson("/api/recommendations", {
    fallbackTitle: "Featured playlists unavailable",
    fallbackMessage: "We couldn’t load featured playlists. Please try again.",
  });
  if (!data || typeof data !== "object") {
    throw toUserError(null, {
      fallbackCode: "INTERNAL_ERROR",
      title: "Featured playlists unavailable",
      message: "We couldn’t load featured playlists. Please try again.",
    });
  }
  return data;
}

export function valueFromDateMap(dateMap, id) {
  if (!dateMap) return null;
  if (dateMap instanceof Map) return dateMap.get(id) || null;
  return dateMap[id] || null;
}