import { Innertube, Log, UniversalCache } from "youtubei.js";

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
const REQUEST_TIMEOUT_MS = 6_000;
const INNERTUBE_CLIENT = {
  clientName: "WEB",
  clientVersion: "2.20260101.00.00",
  hl: "en",
  gl: "US",
};
// Public WEB client key shipped in YouTube's own player (same one youtubei.js uses).
const INNERTUBE_WEB_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
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

async function timedFetch(input, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
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

function runsText(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value.content === "string") return value.content;
  if (typeof value.simpleText === "string") return value.simpleText;
  if (Array.isArray(value.runs)) {
    return value.runs.map((run) => run?.text).filter(Boolean).join("");
  }
  return "";
}

function thumbnailUrl(node) {
  const thumbs =
    node?.thumbnails ||
    node?.thumbnail?.thumbnails ||
    node?.image?.sources ||
    node?.thumbnailViewModel?.image?.sources;
  if (!Array.isArray(thumbs) || thumbs.length === 0) return "";
  return thumbs[thumbs.length - 1]?.url || thumbs[0]?.url || "";
}

function mapVideoRenderer(renderer) {
  if (!renderer?.videoId) return null;
  return {
    id: { videoId: renderer.videoId },
    snippet: {
      title: runsText(renderer.title),
      channelTitle: runsText(renderer.ownerText || renderer.shortBylineText || renderer.longBylineText) || "YouTube",
      description: runsText(renderer.descriptionSnippet),
      publishedAt: runsText(renderer.publishedTimeText),
      thumbnails: { high: { url: thumbnailUrl(renderer.thumbnail || renderer) } },
    },
    status: { embeddable: true, privacyStatus: "public" },
  };
}

function mapPlaylistRenderer(renderer) {
  if (!renderer?.playlistId) return null;
  return {
    id: { playlistId: renderer.playlistId },
    snippet: {
      title: runsText(renderer.title),
      channelTitle: runsText(renderer.shortBylineText || renderer.longBylineText) || "YouTube",
      description: "",
      publishedAt: "",
      thumbnails: { high: { url: thumbnailUrl(renderer.thumbnails?.[0] || renderer.thumbnail || renderer) } },
    },
  };
}

function mapLockupView(view, type) {
  const id = view?.contentId;
  if (!id) return null;
  const title =
    view?.metadata?.lockupMetadataViewModel?.title?.content ||
    view?.metadata?.title?.content ||
    "";
  const rows =
    view?.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows;
  const channel = rows?.[0]?.metadataParts?.[0]?.text?.content || "YouTube";
  const image =
    view?.contentImage?.thumbnailViewModel?.image?.sources ||
    view?.contentImage?.image?.sources;
  const mapped = {
    snippet: {
      title,
      channelTitle: channel,
      description: "",
      publishedAt: "",
      thumbnails: { high: { url: thumbnailUrl({ thumbnails: image }) } },
    },
    status: { embeddable: true, privacyStatus: "public" },
  };
  if (type === "playlist" && id.length > 11) {
    return { ...mapped, id: { playlistId: id } };
  }
  if (type !== "playlist" && /^[A-Za-z0-9_-]{11}$/.test(id)) {
    return { ...mapped, id: { videoId: id } };
  }
  return null;
}

function collectSearchItems(node, type, items, seen) {
  if (!node || items.length >= 50) return items;
  if (Array.isArray(node)) {
    node.forEach((child) => collectSearchItems(child, type, items, seen));
    return items;
  }
  if (typeof node !== "object") return items;

  const video = mapVideoRenderer(
    node.videoRenderer || node.compactVideoRenderer || node.videoWithContextRenderer,
  );
  if (type !== "playlist" && video && !seen.has(video.id.videoId)) {
    seen.add(video.id.videoId);
    items.push(video);
  }

  const playlist = mapPlaylistRenderer(node.playlistRenderer || node.compactPlaylistRenderer);
  if (type === "playlist" && playlist && !seen.has(playlist.id.playlistId)) {
    seen.add(playlist.id.playlistId);
    items.push(playlist);
  }

  if (node.lockupViewModel) {
    const lockup = mapLockupView(node.lockupViewModel, type);
    const lockupId = lockup?.id?.videoId || lockup?.id?.playlistId;
    if (lockup && lockupId && !seen.has(lockupId)) {
      seen.add(lockupId);
      items.push(lockup);
    }
  }

  Object.values(node).forEach((child) => {
    if (child && typeof child === "object") collectSearchItems(child, type, items, seen);
  });
  return items;
}

async function searchViaInnerTubeHttp(query, type, maxResults) {
  const cacheKey = `http:${type}:${maxResults}:${query}`;
  const cached = getCachedSearch(cacheKey);
  if (cached) return cached;

  const response = await timedFetch(
    `https://www.youtube.com/youtubei/v1/search?prettyPrint=false&key=${INNERTUBE_WEB_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-YouTube-Client-Name": "1",
        "X-YouTube-Client-Version": INNERTUBE_CLIENT.clientVersion,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
      body: JSON.stringify({
        context: { client: INNERTUBE_CLIENT },
        query,
        params: type === "playlist" ? "EgIQAw==" : "EgIQAQ==",
      }),
    },
  );
  if (!response.ok) return null;
  const payload = await response.json().catch(() => null);
  if (!payload) return null;

  const items = collectSearchItems(payload, type, [], new Set()).slice(0, maxResults);
  if (items.length === 0) return null;
  const result = { ok: true, status: 200, data: { items } };
  cacheSearch(cacheKey, result);
  return result;
}

async function fetchFromOfficialApi(endpoint, params, fetchOptions) {
  const key = youtubeApiKey();
  if (!key || Date.now() < officialApiCooldownUntil) return null;

  try {
    const query = new URLSearchParams();
    Object.entries(params || {}).forEach(([name, value]) => {
      if (value !== undefined && value !== null) query.set(name, String(value));
    });
    query.set("key", key);

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
  try {
    const officialResult = await fetchFromOfficialApi(endpoint, params, fetchOptions);
    if (officialResult) return officialResult;

    const maxResults = Math.min(
      50,
      Math.max(1, Number.parseInt(params.maxResults || "10", 10) || 10),
    );
    if (endpoint === "search") {
      const type = params.type === "playlist" ? "playlist" : "video";
      const httpResult = await searchViaInnerTubeHttp(params.q || "", type, maxResults);
      if (httpResult) return httpResult;
    }
    if (endpoint === "videos" && params.chart === "mostPopular") {
      const httpResult = await searchViaInnerTubeHttp("top songs this week", "video", maxResults);
      if (httpResult) {
        return {
          ok: true,
          status: 200,
          data: {
            items: (httpResult.data.items || []).map((item) => ({
              ...item,
              id: item.id.videoId,
            })),
          },
        };
      }
    }

    return await fetchFromInnertube(endpoint, params);
  } catch (error) {
    console.error(`YouTube ${endpoint} fallback failed:`, error);
    return { ok: false, status: 502, data: null };
  }
}
