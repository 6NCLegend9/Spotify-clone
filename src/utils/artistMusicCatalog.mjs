import { ApiRouteError } from "./apiResponseCore.mjs";
import { allowlistedMediaUrl } from "./mediaUrl.mjs";
import { cleanTitle } from "./text.js";

const CHANNEL_ID = /^UC[A-Za-z0-9_-]{20,24}$/;
const ALBUM_ID = /^MPR[A-Za-z0-9_-]{3,125}$/;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

function text(value) {
  if (typeof value === "string") return cleanTitle(value);
  if (typeof value?.text === "string") return cleanTitle(value.text);
  return "";
}

function thumbnail(value) {
  const images = Array.isArray(value) ? value : value?.contents || value?.thumbnails || value?.thumbnail?.contents || value?.thumbnail || [];
  if (!Array.isArray(images)) return "";
  return [...images].sort((left, right) => (right.width || 0) - (left.width || 0))
    .map(image => allowlistedMediaUrl(image?.url)).find(Boolean) || "";
}

function credits(values) {
  const result = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const name = text(value?.name);
    const channelId = value?.channel_id || value?.channelId || value?.id || "";
    if (!name) continue;
    const key = `${name}:${channelId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ name, channelId: CHANNEL_ID.test(channelId) ? channelId : "" });
  }
  return result;
}

function track(item, fallback = {}) {
  const id = item?.id || item?.video_id || item?.endpoint?.payload?.videoId || "";
  const title = text(item?.title);
  if (!VIDEO_ID.test(id) || !title) return null;
  const artists = credits(item.artists || item.authors || (item.author ? [item.author] : []));
  if (!artists.length && fallback.artists?.length) artists.push(...fallback.artists);
  const seconds = Number(item?.duration?.seconds || item?.duration || 0);
  const durationText = text(item?.duration?.text);
  const duration = Number.isFinite(seconds) && seconds > 0 ? seconds : /^\d+(?::[0-5]\d){1,2}$/.test(durationText)
    ? durationText.split(":").reduce((total, part) => total * 60 + Number(part), 0) : 0;
  return {
    id, title, artists,
    channel: artists.map(artist => artist.name).join(", "),
    channelId: artists.find(artist => artist.channelId)?.channelId || "",
    thumbnail: thumbnail(item?.thumbnails || item?.thumbnail) || fallback.thumbnail || "",
    duration,
    ...(text(item?.views) ? { views: text(item.views) } : {}),
  };
}

function unique(items) {
  const merged = new Map();
  for (const item of items) {
    if (!item?.id) continue;
    const first = merged.get(item.id);
    if (!first) merged.set(item.id, item);
    else if (!(first.duration > 0) && item.duration > 0) merged.set(item.id, { ...first, duration: item.duration });
  }
  return [...merged.values()];
}

function releaseType(value, fallback = "album") {
  const subtitle = text(value).toLowerCase();
  if (/(^|[•·\s])ep([•·\s]|$)/.test(subtitle)) return "ep";
  if (/(^|[•·\s])single([•·\s]|$)/.test(subtitle)) return "single";
  return fallback;
}

export function isMusicAlbumId(value) {
  return typeof value === "string" && ALBUM_ID.test(value);
}

export function normalizeArtistMusicSections(channelId, page) {
  const header = page?.header?.header || page?.header || {};
  const background = thumbnail(header.thumbnail || header.thumbnails);
  const portrait = thumbnail(header.foreground_thumbnail) || background;
  const artist = {
    id: channelId,
    title: text(header.title),
    description: text(header.description),
    thumbnail: portrait,
    banner: background,
  };
  const result = { artist, popularTracks: [], releases: [], playlists: [], musicVideos: [], relatedArtists: [] };
  for (const section of page?.sections || []) {
    const title = text(section?.title || section?.header?.title).toLowerCase();
    const contents = Array.isArray(section?.contents) ? section.contents : [];
    if (title === "top songs") {
      result.popularTracks.push(...contents.map(item => track(item)).filter(Boolean));
    } else if (title === "albums" || /^(singles|singles and eps|singles & eps|eps)$/.test(title)) {
      for (const item of contents) {
        if (item?.item_type !== "album" || !isMusicAlbumId(item.id) || !text(item.title)) continue;
        result.releases.push({
          id: item.id,
          title: text(item.title),
          type: releaseType(item.subtitle, title === "albums" ? "album" : title === "eps" ? "ep" : "single"),
          year: /^[12]\d{3}$/.test(String(item.year || "")) ? String(item.year) : "",
          thumbnail: thumbnail(item.thumbnail || item.thumbnails),
        });
      }
    } else if (title === "videos" || title === "music videos") {
      result.musicVideos.push(...contents.filter(item => item?.item_type === "video").map(item => track(item)).filter(Boolean));
    } else {
      for (const item of contents) {
        if (item?.item_type === "playlist") {
          const id = typeof item.id === "string" ? item.id.replace(/^VL/, "") : "";
          if (!/^[A-Za-z0-9_-]{2,128}$/.test(id) || !text(item.title)) continue;
          result.playlists.push({ id, title: text(item.title), description: text(item.subtitle), thumbnail: thumbnail(item.thumbnail || item.thumbnails) });
        } else if (item?.item_type === "artist" && CHANNEL_ID.test(item.id) && item.id !== channelId && text(item.title || item.name)) {
          result.relatedArtists.push({ id: item.id, title: text(item.title || item.name), thumbnail: thumbnail(item.thumbnail || item.thumbnails) });
        }
      }
    }
  }
  for (const key of ["popularTracks", "releases", "playlists", "musicVideos", "relatedArtists"]) result[key] = unique(result[key]).slice(0, 100);
  return result;
}

export function normalizeMusicAlbum(albumId, page) {
  const header = page?.header || {};
  const artists = credits(header.author ? [header.author] : header.strapline_text_one?.runs
    ?.filter(run => CHANNEL_ID.test(run.endpoint?.payload?.browseId || ""))
    .map(run => ({ name: run.text, channel_id: run.endpoint.payload.browseId })));
  const year = text(header.year) || `${text(header.subtitle)} ${text(header.second_subtitle)}`.match(/\b[12]\d{3}\b/)?.[0] || "";
  const album = {
    id: albumId,
    title: text(header.title),
    description: text(header.description?.description || header.description),
    artists,
    thumbnail: thumbnail(header.thumbnails || header.thumbnail),
    year,
    type: releaseType(header.subtitle),
  };
  return { album, tracks: unique((page?.contents || []).map(item => track(item, album)).filter(Boolean)).slice(0, 200) };
}

// A deadline covers session initialization and response parsing as well as fetch.
// Only successful reads enter the bounded cache; an upstream outage stays retryable.
export function createMusicCatalogReader(getInnertube, { timeoutMs = 8_000, ttlMs = 15 * 60_000, maxEntries = 80 } = {}) {
  const cache = new Map();
  const pending = new Map();
  async function read(kind, id, load) {
    const key = `${kind}:${id}`;
    const cached = cache.get(key);
    if (cached?.expiresAt > Date.now()) return cached.value;
    cache.delete(key);
    if (pending.has(key)) return pending.get(key).response;
    if (pending.size >= maxEntries) {
      throw new ApiRouteError("SERVICE_UNAVAILABLE", { message: "The music catalog is busy. Please try again shortly." });
    }
    const flight = { response: null, upstreamSettled: false, responseSettled: false };
    const release = () => {
      if (flight.upstreamSettled && flight.responseSettled && pending.get(key) === flight) pending.delete(key);
    };
    const upstream = Promise.resolve().then(getInnertube).then(load);
    const settled = () => { flight.upstreamSettled = true; release(); };
    // A response deadline does not cancel Innertube's response body or parser.
    // Keep its admission slot, including same-ID coalescing, until it settles.
    upstream.then(settled, settled);
    const operation = (async () => {
      let timer;
      try {
        const value = await Promise.race([
          upstream,
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Music catalog deadline exceeded")), timeoutMs); }),
        ]);
        if (!value?.[kind]?.title) throw new Error("Incomplete music catalog response");
        if (cache.size >= maxEntries) cache.delete(cache.keys().next().value);
        cache.set(key, { value, expiresAt: Date.now() + ttlMs });
        return value;
      } catch {
        throw new ApiRouteError("SERVICE_UNAVAILABLE", { message: "The music catalog could not be loaded. Please try again." });
      } finally {
        clearTimeout(timer);
        flight.responseSettled = true;
        release();
      }
    })();
    flight.response = operation;
    pending.set(key, flight);
    return operation;
  }
  return {
    artist: channelId => read("artist", channelId, async youtube => normalizeArtistMusicSections(channelId, await youtube.music.getArtist(channelId))),
    album: albumId => read("album", albumId, async youtube => normalizeMusicAlbum(albumId, await youtube.music.getAlbum(albumId))),
  };
}
