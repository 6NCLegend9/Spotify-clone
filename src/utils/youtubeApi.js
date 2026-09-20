import { Innertube, Log, UniversalCache } from "youtubei.js";
import { cleanTitle } from "./text.js";
import { firstSuccessfulSearch } from "./youtubeSearchFallback.mjs";
import { logServerDiagnostic } from "./diagnostics.mjs";
import { isYoutubeVideoId, sanitizeYoutubeComments } from "./youtubeComments.mjs";
import { videoIdsMentionedInText } from "./commentVideoIds.mjs";
import {
  captionLinesFromJson3,
  captionLinesFromTranscript,
  captionLinesFromVtt,
  captionTracksFromPlayerResponse,
  pickCaptionTrack,
  pickTimedTextTrack,
  playerResponseFromWatchHtml,
} from "./youtubeCaptions.mjs";

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
const REQUEST_TIMEOUT_MS = 6_000;
const INNERTUBE_CLIENT = {
  clientName: "WEB",
  clientVersion: "2.20260101.00.00",
  hl: "en",
  gl: "US",
};
const YOUTUBE_BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
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
  let text = "";
  if (typeof value === "string") text = value;
  else if (typeof value.text === "string") text = value.text;
  else if (typeof value.toString === "function") {
    const raw = value.toString();
    text = raw === "[object Object]" ? "" : raw;
  }
  return cleanTitle(text);
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
  return cleanTitle(item?.author?.name || metadataParts(item)[0] || "", "YouTube");
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
      // Search metadata does not prove that embedding is permitted.
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
      publishedAt: textValue(item?.published) || "",
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
      title: cleanTitle(extra.title || ""),
      channelTitle: cleanTitle(extra.channelTitle, "YouTube"),
      description: cleanTitle(extra.description || ""),
      publishedAt: extra.publishedAt || "",
      thumbnails: {
        high: { url: extra.thumbnail || `https://i.ytimg.com/vi/${id}/hqdefault.jpg` },
      },
    },
    contentDetails: {
      duration: extra.duration || "PT0S",
    },
    status: {
      // oEmbed metadata does not prove playback availability for this viewer.
      privacyStatus: "public",
    },
  };
}

// Converts a duration in seconds into an ISO-8601 string (e.g. 225 -> "PT3M45S").
function secondsToIso(totalSeconds) {
  const total = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  if (total === 0) return "PT0S";
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return `PT${hours ? `${hours}H` : ""}${minutes ? `${minutes}M` : ""}${seconds ? `${seconds}S` : ""}`;
}

// No-API-key duration lookup via Innertube. oEmbed does not expose duration,
// so when the official Data API is throttled we ask YouTube's own player
// endpoint for it. Bounded and defensive: returns 0 (unknown) on any failure.
async function fetchVideoDurationSeconds(id) {
  try {
    const innertube = await getInnertube();
    const info = await Promise.race([
      innertube.getBasicInfo(id),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("duration lookup timed out")), 3500),
      ),
    ]);
    const seconds = Number(info?.basic_info?.duration);
    return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  } catch (error) {
    return 0;
  }
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
    const durationSeconds = await fetchVideoDurationSeconds(id);
    const value = syntheticVideo(id, {
      title: data.title || "",
      channelTitle: data.author_name || "YouTube",
      thumbnail: data.thumbnail_url,
      duration: durationSeconds > 0 ? secondsToIso(durationSeconds) : "PT0S",
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
let officialQuotaWarned = false;

function officialApiAvailable() {
  return Date.now() >= officialApiCooldownUntil && Boolean(youtubeApiKey());
}

function runsText(value) {
  if (!value) return "";
  if (typeof value === "string") return cleanTitle(value);
  if (typeof value.content === "string") return cleanTitle(value.content);
  if (typeof value.simpleText === "string") return cleanTitle(value.simpleText);
  if (Array.isArray(value.runs)) {
    return cleanTitle(value.runs.map((run) => run?.text).filter(Boolean).join(""));
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
    status: { privacyStatus: "public" },
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

function mapChannelRenderer(renderer) {
  const channelId =
    renderer?.channelId || renderer?.navigationEndpoint?.browseEndpoint?.browseId || "";
  if (!/^UC[A-Za-z0-9_-]{20,24}$/.test(channelId)) return null;
  let thumbnail = thumbnailUrl(renderer.thumbnail || renderer);
  if (thumbnail.startsWith("//")) thumbnail = `https:${thumbnail}`;
  const title = runsText(renderer.title);
  return {
    id: { channelId },
    snippet: {
      title,
      channelTitle: title,
      channelId,
      description: runsText(renderer.descriptionSnippet),
      publishedAt: "",
      thumbnails: { high: { url: thumbnail } },
    },
  };
}

function mapLockupView(view, type) {
  const id = view?.contentId;
  if (!id) return null;
  const title = cleanTitle(
    view?.metadata?.lockupMetadataViewModel?.title?.content
      || view?.metadata?.title?.content
      || "",
  );
  const rows =
    view?.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows;
  const channel = cleanTitle(rows?.[0]?.metadataParts?.[0]?.text?.content || "", "YouTube");
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
    status: { privacyStatus: "public" },
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
  if (type === "video" && video && !seen.has(video.id.videoId)) {
    seen.add(video.id.videoId);
    items.push(video);
  }

  const playlist = mapPlaylistRenderer(node.playlistRenderer || node.compactPlaylistRenderer);
  if (type === "playlist" && playlist && !seen.has(playlist.id.playlistId)) {
    seen.add(playlist.id.playlistId);
    items.push(playlist);
  }

  if (type === "channel") {
    const channel = mapChannelRenderer(node.channelRenderer || node.gridChannelRenderer);
    if (channel && !seen.has(channel.id.channelId)) {
      seen.add(channel.id.channelId);
      items.push(channel);
    }
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
        params: type === "channel" ? "EgIQAg==" : type === "playlist" ? "EgIQAw==" : "EgIQAQ==",
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

// No-key channel lookup (name -> channel id + avatar) so followed-artist backfill and
// the search "Artists" row keep working when the Data API key is missing or quota-limited.
export async function searchChannelsViaInnertube(query, maxResults = 12) {
  if (!query || typeof query !== "string") {
    return { ok: true, status: 200, data: { items: [] } };
  }
  try {
    const result = await searchViaInnerTubeHttp(query, "channel", maxResults);
    return result || { ok: true, status: 200, data: { items: [] } };
  } catch {
    return { ok: false, status: 502, data: null };
  }
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
      if (!officialQuotaWarned) {
        officialQuotaWarned = true;
        console.warn(`YouTube Data API returned ${response.status}; using fallback until cooldown ends.`);
      }
    } else {
      console.warn(`YouTube Data API ${endpoint} returned ${response.status}; using fallback.`);
    }
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

function mapChannelSnippet(item, fallbackId = "") {
  const id = item?.id || fallbackId;
  if (!id) return null;
  return {
    id,
    title: cleanTitle(item?.snippet?.title || ""),
    description: cleanTitle(item?.snippet?.description || ""),
    thumbnail:
      item?.snippet?.thumbnails?.high?.url
      || item?.snippet?.thumbnails?.medium?.url
      || item?.snippet?.thumbnails?.default?.url
      || "",
  };
}

function mapSearchItemsToTracks(items, extras = {}) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => item?.id?.videoId || (typeof item?.id === "string" && /^[A-Za-z0-9_-]{11}$/.test(item.id)))
    .map((item) => {
      const id = item.id?.videoId || item.id;
      return {
        id,
        title: cleanTitle(item.snippet?.title || ""),
        channel: cleanTitle(item.snippet?.channelTitle || extras.channel || ""),
        channelId: item.snippet?.channelId || extras.channelId || "",
        description: cleanTitle(item.snippet?.description || ""),
        publishedAt: item.snippet?.publishedAt || "",
        thumbnail:
          item.snippet?.thumbnails?.high?.url
          || item.snippet?.thumbnails?.medium?.url
          || item.snippet?.thumbnails?.default?.url
          || "",
        seedQuery: extras.seedQuery || extras.channel || "",
        genre: extras.genre || extras.channel || "",
      };
    });
}

function uploadsPlaylistId(channelId) {
  return String(channelId || "").startsWith("UC") ? `UU${channelId.slice(2)}` : "";
}

function mergeTracks(lists) {
  const seen = new Set();
  const merged = [];
  for (const list of lists) {
    for (const track of list || []) {
      if (!track?.id || seen.has(track.id)) continue;
      if (track.title === "Private video" || track.title === "Deleted video") continue;
      seen.add(track.id);
      merged.push(track);
    }
  }
  return merged;
}

function mapPlaylistItemsToTracks(items, extras = {}) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => item?.snippet?.resourceId?.videoId && item?.status?.privacyStatus !== "private")
    .map((item) => ({
      id: item.snippet.resourceId.videoId,
      title: cleanTitle(item.snippet.title || ""),
      channel: cleanTitle(item.snippet.videoOwnerChannelTitle || item.snippet.channelTitle || extras.channel || ""),
      channelId: extras.channelId || "",
      description: cleanTitle(item.snippet.description || ""),
      publishedAt: item.snippet.publishedAt || "",
      thumbnail:
        item.snippet.thumbnails?.high?.url
        || item.snippet.thumbnails?.medium?.url
        || item.snippet.thumbnails?.default?.url
        || "",
      seedQuery: extras.seedQuery || extras.channel || "",
      genre: extras.genre || extras.channel || "",
    }));
}

async function fetchPlaylistPages(playlistId, extras, maxResults, pageToken = "") {
  const tracks = [];
  let token = pageToken || "";
  let nextPageToken = "";
  const pageSize = Math.min(50, Math.max(1, maxResults));
  const maxPages = Math.max(1, Math.ceil(maxResults / pageSize));

  for (let page = 0; page < maxPages && tracks.length < maxResults; page += 1) {
    const params = {
      part: "snippet,status",
      playlistId,
      maxResults: String(Math.min(50, maxResults - tracks.length)),
    };
    if (token) params.pageToken = token;
    const result = await youtubeFetch("playlistItems", params);
    if (!result?.ok) break;
    tracks.push(...mapPlaylistItemsToTracks(result.data?.items, extras));
    token = result.data?.nextPageToken || "";
    nextPageToken = token;
    if (!token) break;
  }

  return { tracks: mergeTracks([tracks]), nextPageToken };
}

async function channelFromInnertube(id, maxResults = 50) {
  try {
    const innertube = await getInnertube();
    const channel = await innertube.getChannel(id);
    const title =
      textValue(channel?.metadata?.title)
      || textValue(channel?.header?.author?.name)
      || textValue(channel?.header?.title)
      || "";
    const description = textValue(channel?.metadata?.description) || "";
    const thumbnail = bestThumbnail(channel?.metadata) || bestThumbnail(channel?.header) || "";
    let feed = typeof channel.getVideos === "function" ? await channel.getVideos() : channel;
    let videoItems = [...(feed?.videos || feed?.items || channel?.videos || [])];
    let pages = 0;
    while (feed?.has_continuation && videoItems.length < maxResults && pages < 3) {
      feed = await feed.getContinuation();
      videoItems.push(...(feed?.videos || feed?.items || []));
      pages += 1;
    }
    return {
      artist: title || thumbnail ? { id, title, description, thumbnail } : null,
      tracks: videoItems.map((item) => mapSearchResult(item, "video")).filter(Boolean),
    };
  } catch {
    return null;
  }
}

export async function fetchYouTubeChannel(id, { name = "", maxResults = 50, pageToken = "" } = {}) {
  const extras = {
    channelId: id,
    channel: name,
    seedQuery: name,
    genre: name,
  };

  const officialChannel = await fetchFromOfficialApi("channels", {
    part: "snippet,contentDetails",
    id,
  });
  let artist = mapChannelSnippet(officialChannel?.data?.items?.[0], id);
  const uploadsId =
    officialChannel?.data?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads
    || uploadsPlaylistId(id);

  if (pageToken && uploadsId) {
    const page = await fetchPlaylistPages(uploadsId, {
      ...extras,
      channel: artist?.title || name,
      seedQuery: artist?.title || name,
    }, maxResults, pageToken);
    return {
      artist: artist || { id, title: name || "Artist", description: "", thumbnail: "" },
      tracks: page.tracks,
      nextPageToken: page.nextPageToken,
    };
  }

  const [popular, uploads, audioSearch, songsSearch, innertubeChannel] = await Promise.all([
    fetchFromOfficialApi("search", {
      part: "snippet",
      channelId: id,
      type: "video",
      order: "viewCount",
      maxResults: "50",
    }),
    uploadsId
      ? fetchPlaylistPages(uploadsId, {
        ...extras,
        channel: artist?.title || name,
        seedQuery: artist?.title || name,
      }, maxResults)
      : Promise.resolve({ tracks: [], nextPageToken: "" }),
    name
      ? youtubeFetch("search", {
        part: "snippet",
        type: "video",
        q: `${name} official audio`,
        maxResults: "25",
      })
      : Promise.resolve(null),
    name
      ? youtubeFetch("search", {
        part: "snippet",
        type: "video",
        q: `${name} songs`,
        maxResults: "25",
      })
      : Promise.resolve(null),
    channelFromInnertube(id, maxResults),
  ]);

  if (!artist && innertubeChannel?.artist) artist = innertubeChannel.artist;
  extras.channel = artist?.title || name;
  extras.seedQuery = artist?.title || name;
  extras.genre = artist?.title || name;

  const tracks = mergeTracks([
    mapSearchItemsToTracks(popular?.data?.items, extras),
    uploads.tracks,
    mapSearchItemsToTracks(audioSearch?.data?.items, extras),
    mapSearchItemsToTracks(songsSearch?.data?.items, extras),
    mapSearchItemsToTracks(innertubeChannel?.tracks, extras),
  ]);

  if (!artist) {
    artist = {
      id,
      title: name || "Artist",
      description: "",
      thumbnail: tracks[0]?.thumbnail || "",
    };
  }

  return {
    artist,
    tracks,
    nextPageToken: uploads.nextPageToken || "",
  };
}

export async function fetchLatestChannelVideos(channelId, { name = "", maxResults = 3 } = {}) {
  if (!/^UC[A-Za-z0-9_-]{20,24}$/.test(channelId)) return [];
  const extras = {
    channelId,
    channel: name,
    seedQuery: name,
    genre: name,
  };

  const official = await fetchFromOfficialApi("search", {
    part: "snippet",
    type: "video",
    channelId,
    order: "date",
    maxResults: String(maxResults),
  });
  const officialTracks = mapSearchItemsToTracks(official?.data?.items, extras);
  if (officialTracks.length) return officialTracks.slice(0, maxResults);

  const uploadsId = uploadsPlaylistId(channelId);
  if (uploadsId) {
    const page = await fetchPlaylistPages(uploadsId, extras, maxResults);
    if (page.tracks.length) return page.tracks.slice(0, maxResults);
  }

  const innertube = await channelFromInnertube(channelId, Math.max(maxResults, 8));
  return mapSearchItemsToTracks(innertube?.tracks, extras).slice(0, maxResults);
}

export async function youtubeFetch(endpoint, params, fetchOptions = {}) {
  const started = performance.now();
  try {
    const { requireOfficial = false, ...requestOptions } = fetchOptions;
    const officialResult = await fetchFromOfficialApi(endpoint, params, requestOptions);
    if (officialResult) return { ...officialResult, source: "official" };
    if (requireOfficial) return { ok: false, status: 503, source: "fallback", data: null };

    const maxResults = Math.min(
      50,
      Math.max(1, Number.parseInt(params.maxResults || "10", 10) || 10),
    );
    if (endpoint === "search") {
      const type = params.type === "playlist" ? "playlist" : "video";
      return await firstSuccessfulSearch([
        () => searchViaInnerTubeHttp(params.q || "", type, maxResults),
        () => fetchFromInnertube(endpoint, params),
      ]);
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
    logServerDiagnostic("provider", { code: "INTERNAL_ERROR" });
    return { ok: false, status: 502, data: null };
  } finally {
    logServerDiagnostic("provider", { durationMs: performance.now() - started });
  }
}

function mapOfficialComment(item) {
  const snippet = item?.snippet?.topLevelComment?.snippet;
  return {
    id: item?.id || item?.snippet?.topLevelComment?.id,
    author: snippet?.authorDisplayName,
    text: snippet?.textOriginal || snippet?.textDisplay,
    likeCount: snippet?.likeCount,
  };
}

function mapInnertubeComment(thread) {
  const comment = thread?.comment;
  const likes = Number.parseInt(String(comment?.like_count || "").replace(/[^\d]/g, ""), 10);
  return {
    id: comment?.comment_id,
    author: comment?.author?.name,
    text: textValue(comment?.content),
    likeCount: Number.isFinite(likes) ? likes : 0,
  };
}

function parseIsoDuration(value = "") {
  const match = String(value).match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0);
}

function commentText(value) {
  if (typeof value === "string") return value;
  if (typeof value?.text === "string") return value.text;
  if (typeof value?.toString === "function") {
    const raw = value.toString();
    return raw === "[object Object]" ? "" : raw;
  }
  return "";
}

function captionTrackUrl(track) {
  return String(track?.base_url || track?.baseUrl || "");
}

function isSafeCaptionUrl(value) {
  try {
    const url = new URL(value.startsWith("//") ? `https:${value}` : value);
    return url.protocol === "https:"
      && /(?:^|\.)(?:youtube\.com|youtube-nocookie\.com|googleapis\.com|google\.com)$/i.test(url.hostname);
  } catch {
    return false;
  }
}

export async function fetchYoutubeTracksByIds(ids) {
  const unique = [...new Set((ids || []).filter((id) => isYoutubeVideoId(id)))].slice(0, 12);
  if (unique.length === 0) return [];
  const { ok, data } = await youtubeFetch("videos", {
    part: "snippet,contentDetails",
    id: unique.join(","),
  }, { next: { revalidate: 3600 } });
  if (!ok) return [];
  const tracks = (Array.isArray(data?.items) ? data.items : []).map((item) => {
    const id = typeof item?.id === "string" ? item.id : "";
    if (!isYoutubeVideoId(id) || !item?.snippet) return null;
    return {
      id,
      title: cleanTitle(item.snippet.title || ""),
      channel: cleanTitle(item.snippet.channelTitle || ""),
      description: cleanTitle(item.snippet.description || ""),
      publishedAt: item.snippet.publishedAt || "",
      thumbnail:
        item.snippet.thumbnails?.high?.url
        || item.snippet.thumbnails?.medium?.url
        || item.snippet.thumbnails?.default?.url
        || "",
      duration: parseIsoDuration(item.contentDetails?.duration),
    };
  }).filter(Boolean);
  const order = new Map(unique.map((id, index) => [id, index]));
  tracks.sort((left, right) => (order.get(left.id) ?? 99) - (order.get(right.id) ?? 99));
  return tracks;
}

async function fetchYouTubeCommentTexts(videoId, maxResults = 20) {
  const id = String(videoId || "").trim();
  if (!isYoutubeVideoId(id)) return [];
  const limit = Math.min(20, Math.max(1, Number(maxResults) || 20));
  const official = await fetchFromOfficialApi("commentThreads", {
    part: "snippet",
    videoId: id,
    maxResults: String(limit),
    order: "relevance",
    textFormat: "plainText",
  });
  if (official?.ok) {
    return (official.data?.items || [])
      .map((item) => String(item?.snippet?.topLevelComment?.snippet?.textOriginal || ""))
      .filter(Boolean);
  }
  try {
    const innertube = await getInnertube();
    const comments = await innertube.getComments(id, "TOP_COMMENTS");
    return (comments?.contents || []).slice(0, limit)
      .map((thread) => commentText(thread?.comment?.content))
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function fetchChannelAlsoPlayed(channelId, { name = "", seedIds = [] } = {}) {
  let seeds = [...new Set((seedIds || []).filter((id) => isYoutubeVideoId(id)))].slice(0, 3);
  const blocked = new Set(seeds);
  if (seeds.length === 0) {
    const { tracks } = await fetchYouTubeChannel(channelId, { name, maxResults: 12 });
    for (const track of tracks || []) {
      if (track?.id) blocked.add(track.id);
    }
    seeds = (tracks || []).map((track) => track?.id).filter((id) => isYoutubeVideoId(id)).slice(0, 3);
  }
  const mentioned = [];
  for (const seedId of seeds) {
    const texts = await fetchYouTubeCommentTexts(seedId, 20);
    for (const text of texts) {
      for (const id of videoIdsMentionedInText(text)) {
        if (blocked.has(id)) continue;
        blocked.add(id);
        mentioned.push(id);
        if (mentioned.length >= 8) break;
      }
      if (mentioned.length >= 8) break;
    }
    if (mentioned.length >= 8) break;
  }
  return fetchYoutubeTracksByIds(mentioned);
}

async function captionLinesFromTrack(track) {
  const raw = captionTrackUrl(track);
  if (!isSafeCaptionUrl(raw)) return [];
  const url = new URL(raw.startsWith("//") ? `https:${raw}` : raw);
  url.searchParams.set("fmt", "json3");
  const videoParam = url.searchParams.get("v") || "";
  const response = await timedFetch(url.toString(), {
    headers: {
      ...YOUTUBE_BROWSER_HEADERS,
      Accept: "*/*",
      Origin: "https://www.youtube.com",
      Referer: videoParam ? `https://www.youtube.com/watch?v=${videoParam}` : "https://www.youtube.com/",
    },
  });
  if (!response.ok) return [];
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("html")) return [];
  if (contentType.includes("json")) {
    return captionLinesFromJson3(await response.json().catch(() => null));
  }
  const text = await response.text();
  if (text.trim().startsWith("{")) {
    try {
      return captionLinesFromJson3(JSON.parse(text));
    } catch {
      return [];
    }
  }
  return captionLinesFromVtt(text);
}

async function captionLinesFromTimedTextUrl(href) {
  const response = await timedFetch(href, { headers: YOUTUBE_BROWSER_HEADERS });
  if (!response.ok) return [];
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("html")) return [];
  const text = await response.text();
  if (text.includes("<title>Sorry...</title>")) return [];
  if (text.trim().startsWith("{")) {
    try {
      return captionLinesFromJson3(JSON.parse(text));
    } catch {
      return [];
    }
  }
  return captionLinesFromVtt(text);
}

async function captionLinesFromWatchPage(videoId) {
  const response = await timedFetch(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&hl=en`, {
    headers: {
      ...YOUTUBE_BROWSER_HEADERS,
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!response.ok) return { lines: [], hadTracks: false };
  const tracks = captionTracksFromPlayerResponse(playerResponseFromWatchHtml(await response.text()));
  const track = pickCaptionTrack(tracks);
  if (!track) return { lines: [], hadTracks: false };
  return { lines: await captionLinesFromTrack(track), hadTracks: true };
}

export async function fetchYouTubeCaptionLines(videoId) {
  const id = String(videoId || "").trim();
  if (!isYoutubeVideoId(id)) return [];
  try {
    const fromWatch = await captionLinesFromWatchPage(id);
    if (fromWatch.lines.length > 0 || fromWatch.hadTracks) return fromWatch.lines;
  } catch {
    // Unsigned timedtext and Innertube still cover some videos.
  }
  const timedTextUrls = [
    `https://www.youtube.com/api/timedtext?v=${encodeURIComponent(id)}&lang=en&fmt=json3`,
    `https://www.youtube.com/api/timedtext?v=${encodeURIComponent(id)}&lang=en-US&fmt=json3`,
    `https://www.youtube.com/api/timedtext?v=${encodeURIComponent(id)}&lang=en&kind=asr&fmt=json3`,
  ];
  for (const href of timedTextUrls) {
    try {
      const lines = await captionLinesFromTimedTextUrl(href);
      if (lines.length > 0) return lines;
    } catch {
      // Try the track list, then Innertube.
    }
  }
  try {
    const list = await timedFetch(`https://www.youtube.com/api/timedtext?type=list&v=${encodeURIComponent(id)}`, {
      headers: YOUTUBE_BROWSER_HEADERS,
    });
    if (list.ok) {
      const track = pickTimedTextTrack(await list.text());
      if (track) {
        const url = new URL("https://www.youtube.com/api/timedtext");
        url.searchParams.set("v", id);
        url.searchParams.set("lang", track.lang);
        url.searchParams.set("fmt", "json3");
        if (track.kind) url.searchParams.set("kind", track.kind);
        const lines = await captionLinesFromTimedTextUrl(url.toString());
        if (lines.length > 0) return lines;
      }
    }
  } catch {
    // Innertube below still covers videos whose list endpoint is empty.
  }
  try {
    const innertube = await getInnertube();
    const info = await innertube.getInfo(id);
    const track = pickCaptionTrack(info?.captions?.caption_tracks || []);
    const fromTrack = track ? await captionLinesFromTrack(track) : [];
    if (fromTrack.length > 0) return fromTrack;
    if (typeof info?.getTranscript !== "function") return [];
    const transcript = await info.getTranscript();
    const segments = transcript?.transcript?.content?.body?.initial_segments || [];
    return captionLinesFromTranscript(segments);
  } catch {
    return [];
  }
}

export async function fetchYouTubeComments(videoId, maxResults = 8) {
  const id = String(videoId || "").trim();
  if (!isYoutubeVideoId(id)) return [];
  const limit = Math.min(8, Math.max(1, Number(maxResults) || 8));

  const official = await fetchFromOfficialApi("commentThreads", {
    part: "snippet",
    videoId: id,
    maxResults: String(limit),
    order: "relevance",
    textFormat: "plainText",
  });
  if (official?.ok) {
    return sanitizeYoutubeComments((official.data?.items || []).map(mapOfficialComment));
  }

  try {
    const innertube = await getInnertube();
    const comments = await innertube.getComments(id, "TOP_COMMENTS");
    return sanitizeYoutubeComments((comments?.contents || []).slice(0, limit).map(mapInnertubeComment));
  } catch {
    return [];
  }
}
