import { Innertube, Log, UniversalCache } from "youtubei.js";

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
const REQUEST_TIMEOUT_MS = 12_000;
const VIDEO_CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_VIDEO_CACHE_ENTRIES = 500;
const videoCache = new Map();
const searchCache = new Map();
const SEARCH_CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_SEARCH_CACHE_ENTRIES = 80;
let innertubePromise = null;

Log.setLevel(Log.Level.ERROR);

function youtubeApiKey() {
  return (process.env.YOUTUBE_API_KEY || "").trim();
}

// A no-key Innertube fallback is always available. Supplying YOUTUBE_API_KEY in
// production remains the most reliable option for playlists and large libraries.
export function hasYouTubeApiKey() {
  return true;
}

function requestSignal(existingSignal) {
  const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  return existingSignal
    ? AbortSignal.any([existingSignal, timeoutSignal])
    : timeoutSignal;
}

async function timedFetch(input, init = {}) {
  return fetch(input, {
    ...init,
    signal: requestSignal(init.signal),
  });
}

async function getInnertube() {
  if (!innertubePromise) {
    innertubePromise = Innertube.create({
      cache: new UniversalCache(false),
      enable_session_cache: false,
      generate_session_locally: true,
      retrieve_player: false,
      fetch: timedFetch,
    }).catch((error) => {
      innertubePromise = null;
      throw error;
    });
  }
  return innertubePromise;
}

function textValue(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value.text === "string") return value.text;
  if (typeof value.toString === "function") {
    const text = value.toString();
    return text === "[object Object]" ? "" : text;
  }
  return "";
}

function thumbnailList(item) {
  const candidates = [
    item?.thumbnails,
    item?.thumbnail,
    item?.content_image?.image,
    item?.content_image?.primary_thumbnail?.image,
    item?.basic_info?.thumbnail,
  ];
  return candidates.find((value) => Array.isArray(value)) || [];
}

function bestThumbnail(item) {
  return [...thumbnailList(item)]
    .filter((image) => image?.url)
    .sort((left, right) => (right.width || 0) - (left.width || 0))[0]?.url || "";
}

function metadataParts(item) {
  return (
    item?.metadata?.metadata?.metadata_rows
      ?.flatMap((row) => row?.metadata_parts || [])
      .map((part) => textValue(part?.text))
      .filter(Boolean) || []
  );
}

function itemId(item) {
  return item?.video_id || item?.id || item?.content_id || "";
}

function itemTitle(item) {
  return textValue(item?.title || item?.metadata?.title);
}

function itemChannel(item) {
  return item?.author?.name || metadataParts(item)[0] || "YouTube";
}

function itemDescription(item) {
  return textValue(item?.description_snippet || item?.description);
}

function mapSearchResult(item, type) {
  const id = itemId(item);
  if (!id) return null;
  const idKey = type === "playlist" ? "playlistId" : "videoId";

  return {
    id: { [idKey]: id },
    snippet: {
      title: itemTitle(item),
      channelTitle: itemChannel(item),
      description: itemDescription(item),
      publishedAt: textValue(item?.published),
      thumbnails: { high: { url: bestThumbnail(item) } },
    },
    status: {
      embeddable: true,
      privacyStatus: "public",
    },
  };
}

function mapPlaylistItem(item) {
  const videoId = itemId(item);
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;

  return {
    snippet: {
      title: itemTitle(item),
      channelTitle: itemChannel(item),
      videoOwnerChannelTitle: itemChannel(item),
      resourceId: { videoId },
      thumbnails: { high: { url: bestThumbnail(item) } },
    },
    status: { privacyStatus: "public" },
  };
}

function getCachedVideo(id) {
  const cached = videoCache.get(id);
  if (!cached || cached.expiresAt <= Date.now()) {
    videoCache.delete(id);
    return null;
  }
  return cached.value;
}

function cacheVideo(id, value) {
  if (videoCache.size >= MAX_VIDEO_CACHE_ENTRIES) {
    videoCache.delete(videoCache.keys().next().value);
  }
  videoCache.set(id, {
    expiresAt: Date.now() + VIDEO_CACHE_TTL_MS,
    value,
  });
}

function getCachedSearch(key) {
  const cached = searchCache.get(key);
  if (!cached || cached.expiresAt <= Date.now()) {
    searchCache.delete(key);
    return null;
  }
  return cached.value;
}

function cacheSearch(key, value) {
  if (searchCache.size >= MAX_SEARCH_CACHE_ENTRIES) {
    searchCache.delete(searchCache.keys().next().value);
  }
  searchCache.set(key, {
    expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
    value,
  });
}

function syntheticVideo(id, extra = {}) {
  return {
    id,
    snippet: {
      title: extra.title || "",
      channelTitle: extra.channelTitle || "YouTube",
      description: extra.description || "",
      publishedAt: extra.publishedAt || "",
      thumbnails: {
        high: { url: extra.thumbnail || `https://i.ytimg.com/vi/${id}/hqdefault.jpg` },
      },
    },
    contentDetails: {
      duration: extra.duration || "PT0S",
    },
    status: {
      embeddable: true,
      privacyStatus: "public",
    },
  };
}

async function fetchOEmbedVideo(id) {
  const cached = getCachedVideo(id);
  if (cached) return cached;

  try {
    const response = await timedFetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`,
    );
    if (!response.ok) {
      const fallback = syntheticVideo(id);
      cacheVideo(id, fallback);
      return fallback;
    }
    const data = await response.json();
    const value = syntheticVideo(id, {
      title: data.title || "",
      channelTitle: data.author_name || "YouTube",
      thumbnail: data.thumbnail_url,
    });
    cacheVideo(id, value);
    return value;
  } catch (error) {
    const fallback = syntheticVideo(id);
    cacheVideo(id, fallback);
    return fallback;
  }
}

async function mapWithConcurrency(values, concurrency, mapper) {
  const results = new Array(values.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      results[index] = await mapper(values[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, worker),
  );
  return results;
}

let officialApiCooldownUntil = 0;

function officialApiAvailable() {
  return Date.now() >= officialApiCooldownUntil && Boolean(youtubeApiKey());
}

async function fetchFromOfficialApi(endpoint, params, fetchOptions) {
  if (!officialApiAvailable()) return null;

  const query = new URLSearchParams();
  Object.entries(params || {}).forEach(([name, value]) => {
    if (value !== undefined && value !== null) query.set(name, String(value));
  });
  query.set("key", key);

  try {
    const response = await timedFetch(
      `${YOUTUBE_API_BASE}/${endpoint}?${query}`,
      fetchOptions,
    );
    const data = await response.json().catch(() => null);
    if (response.ok) {
      return { ok: true, status: response.status, data };
    }
    if (response.status === 403 || response.status === 429) {
      officialApiCooldownUntil = Date.now() + 10 * 60 * 1000;
    }
    console.warn(`YouTube Data API ${endpoint} returned ${response.status}; using fallback.`);
  } catch (error) {
    console.warn(`YouTube Data API ${endpoint} was unavailable; using fallback.`);
  }
  return null;
}

async function fetchFromInnertube(endpoint, params = {}) {
  const maxResults = Math.min(
    50,
    Math.max(1, Number.parseInt(params.maxResults || "10", 10) || 10),
  );

  if (endpoint === "videos" && params.id) {
    const ids = String(params.id)
      .split(",")
      .filter((id) => /^[A-Za-z0-9_-]{11}$/.test(id))
      .slice(0, 50);
    const items = await mapWithConcurrency(ids, 10, fetchOEmbedVideo);
    return {
      ok: true,
      status: 200,
      data: { items: items.filter(Boolean) },
    };
  }

  if (endpoint === "search") {
    const type = params.type === "playlist" ? "playlist" : "video";
    const cacheKey = `${type}:${maxResults}:${params.q || ""}`;
    const cached = getCachedSearch(cacheKey);
    if (cached) return cached;
    const innertube = await getInnertube();
    const search = await innertube.search(params.q || "", { type });
    const items = (search.results || [])
      .map((item) => mapSearchResult(item, type))
      .filter(Boolean)
      .slice(0, maxResults);
    const result = { ok: true, status: 200, data: { items } };
    cacheSearch(cacheKey, result);
    return result;
  }

  const innertube = await getInnertube();

  if (endpoint === "videos" && params.chart === "mostPopular") {
    const search = await innertube.search("top songs this week", { type: "video" });
    const items = (search.results || [])
      .map((item) => mapSearchResult(item, "video"))
      .filter(Boolean)
      .slice(0, maxResults)
      .map((item) => ({ ...item, id: item.id.videoId }));
    return { ok: true, status: 200, data: { items } };
  }

  if (endpoint === "playlistItems" && params.playlistId) {
    const playlist = await innertube.getPlaylist(params.playlistId);
    const items = (playlist.items || [])
      .map(mapPlaylistItem)
      .filter(Boolean)
      .slice(0, maxResults);
    return { ok: true, status: 200, data: { items } };
  }

  return { ok: false, status: 400, data: null };
}

export async function youtubeFetch(endpoint, params, fetchOptions = {}) {
  const officialResult = await fetchFromOfficialApi(endpoint, params, fetchOptions);
  if (officialResult) return officialResult;

  try {
    return await fetchFromInnertube(endpoint, params);
  } catch (error) {
    console.error(`YouTube ${endpoint} fallback failed:`, error);
    return { ok: false, status: 502, data: null };
  }
}
