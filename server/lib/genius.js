import { readText } from "./filterBuilder.js";

const GENIUS_API_URL = "https://api.genius.com";
const CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_CACHE_ENTRIES = 120;
const resultCache = new Map();

function createProviderError(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function getAccessToken() {
  return typeof process.env.GENIUS_ACCESS_TOKEN === "string" ? process.env.GENIUS_ACCESS_TOKEN.trim() : "";
}

function normalized(value) {
  return String(value || "").trim().toLocaleLowerCase();
}

function getCacheKey(title, artistName) {
  return `${normalized(title)}:${normalized(artistName)}`;
}

function readHttpsUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function readGeniusUrl(value) {
  const url = readHttpsUrl(value);
  if (!url) return null;
  const hostname = new URL(url).hostname;
  return hostname === "genius.com" || hostname.endsWith(".genius.com") ? url : null;
}

function scoreResult(result, title, artistName) {
  const resultTitle = normalized(result?.title);
  const resultArtist = normalized(result?.primary_artist?.name);
  const desiredTitle = normalized(title);
  const desiredArtist = normalized(artistName);
  let score = 0;
  if (resultTitle === desiredTitle) score += 12;
  else if (resultTitle.includes(desiredTitle) || desiredTitle.includes(resultTitle)) score += 6;
  if (resultArtist === desiredArtist) score += 8;
  else if (resultArtist.includes(desiredArtist) || desiredArtist.includes(resultArtist)) score += 4;
  return score;
}

function serializeSong(result) {
  const title = readText(result?.title, 200);
  const artistName = readText(result?.primary_artist?.name, 160);
  const lyricsUrl = readGeniusUrl(result?.url);
  if (!title || !artistName || !lyricsUrl || !Number.isInteger(result?.id)) return null;

  return {
    provider: "genius",
    geniusId: String(result.id),
    title,
    fullTitle: readText(result.full_title, 240) || `${artistName} - ${title}`,
    artistName,
    lyricsUrl,
    coverUrl: readHttpsUrl(result.song_art_image_thumbnail_url || result.header_image_thumbnail_url),
  };
}

function readCached(cacheKey) {
  const entry = resultCache.get(cacheKey);
  if (!entry || entry.expiresAt <= Date.now()) {
    resultCache.delete(cacheKey);
    return undefined;
  }
  return entry.value;
}

function writeCached(cacheKey, value) {
  if (resultCache.size >= MAX_CACHE_ENTRIES) resultCache.delete(resultCache.keys().next().value);
  resultCache.set(cacheKey, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

export function createGeniusClient() {
  async function searchSong({ title, artistName }) {
    const safeTitle = readText(title, 180);
    const safeArtistName = readText(artistName, 160);
    if (!safeTitle || !safeArtistName) return null;

    const cacheKey = getCacheKey(safeTitle, safeArtistName);
    const cached = readCached(cacheKey);
    if (cached !== undefined) return cached;

    const accessToken = getAccessToken();
    if (!accessToken) throw createProviderError("GENIUS_UNCONFIGURED", "Genius integration is not configured", 503);

    const url = new URL("/search", GENIUS_API_URL);
    url.searchParams.set("q", `${safeArtistName} ${safeTitle}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) throw createProviderError("GENIUS_AUTH", "Genius authorization failed", response.status);
        if (response.status === 429) throw createProviderError("GENIUS_RATE_LIMIT", "Genius rate limit reached", response.status);
        throw createProviderError("GENIUS_REQUEST_FAILED", "Genius request failed", response.status);
      }

      const payload = await response.json();
      const results = (payload?.response?.hits || [])
        .filter((hit) => hit?.type === "song" && hit?.result)
        .map((hit) => hit.result)
        .sort((left, right) => scoreResult(right, safeTitle, safeArtistName) - scoreResult(left, safeTitle, safeArtistName));
      const match = serializeSong(results[0]);
      writeCached(cacheKey, match);
      return match;
    } catch (error) {
      if (error.name === "AbortError") throw createProviderError("GENIUS_TIMEOUT", "Genius request timed out", 504);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  return { searchSong };
}