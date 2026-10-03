import { sameRadioSongFamily } from "./songIdentity.mjs";

const RADIO_SEED_PREFIX = "__kasa_radio__:";
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const FEATURE_MARKER = /\b(?:feat(?:uring)?|ft)\.?\b/i;
const RADIO_ARTIST_GENERIC_SEGMENT = /^(?:official|official\s+audio|official\s+(?:music\s+)?video|audio|video|music\s+video|lyrics?|lyric\s+video|visuali[sz]er|remix|edit|version|live|instrumental|acoustic|slowed|sped\s*up|reverb|nightcore|extended|clean|explicit|4k|uhd|hd)\b/i;

export function normalizeRadioArtist(value) {
  return String(value || "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/\s*[-–—]\s*topic\s*$/i, "")
    .replace(/\bvevo\b/gi, "")
    .replace(/\bofficial\b/gi, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function radioText(value, max = 120) {
  return String(value || "")
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function radioTitle(value) {
  return radioText(value)
    .replace(/\s*[\(\[][^)\]]*(?:official|audio|video|lyrics?|visuali[sz]er|4k|hd)[^)\]]*[\)\]]\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function radioArtistField(track) {
  const values = [
    track?.radioSeedArtist,
    track?.primaryArtists,
    track?.artist,
    track?.author_name,
    track?.author,
  ];
  for (const value of values) {
    if (Array.isArray(value)) {
      const first = value.find((item) => (
        typeof item === "string"
          ? item.trim()
          : typeof item?.name === "string" && item.name.trim()
      ));
      if (typeof first === "string") return normalizeRadioArtist(first);
      if (first?.name) return normalizeRadioArtist(first.name);
      continue;
    }
    if (typeof value === "string" && value.trim()) return normalizeRadioArtist(value);
    if (value?.name && typeof value.name === "string") return normalizeRadioArtist(value.name);
  }
  return "";
}

function radioArtistSegment(value) {
  return normalizeRadioArtist(
    String(value || "")
      .replace(/\((?:[^)]*\b(?:official|video|audio|version|visuali[sz]er|soundtrack|movie|lyrics?|4k|uhd|hd)\b[^)]*)\)/gi, " ")
      .replace(/\[(?:[^\]]*\b(?:official|video|audio|version|visuali[sz]er|soundtrack|movie|lyrics?|4k|uhd|hd)\b[^\]]*)\]/gi, " "),
  );
}

function sameRadioArtistText(left, right) {
  return Boolean(
    left
    && right
    && (
      left === right
      || left.includes(right)
      || right.includes(left)
    )
  );
}

export function radioArtistIdentity(track) {
  if (!track || typeof track !== "object") return "";
  const explicitArtist = radioArtistField(track);
  const channel = normalizeRadioArtist(track.channel || track.channelTitle || "");
  const rawTitle = radioText(track.title || track.name || "", 240).replace(/[–—]/g, " - ");
  const parts = rawTitle
    .split(/\s+(?:-|\|)\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 2) return explicitArtist || channel;

  const firstRaw = parts[0];
  const first = radioArtistSegment(firstRaw);
  const second = radioArtistSegment(parts[1]);

  if (FEATURE_MARKER.test(firstRaw)) return second || explicitArtist || channel;
  if (channel && second && sameRadioArtistText(channel, second)) return channel;
  if (channel && first && sameRadioArtistText(channel, first)) return channel;
  if (explicitArtist) return explicitArtist;

  // A suffix such as "Official Audio" describes the media, not an artist.
  // In that shape the uploader is a safer artist fallback than the song title.
  if (second && RADIO_ARTIST_GENERIC_SEGMENT.test(second)) return channel || first;

  // "Artist - Song" is the dominant YouTube music title shape. When the
  // uploader is a label/mirror, use the title artist so radio diversity does
  // not treat every uploader as a different performer.
  return first || channel || second;
}

export function buildRadioDiscoveryQueries(
  track,
  {
    originTrack = null,
    contextName = "",
    limit = 4,
  } = {},
) {
  const origin = originTrack?.id ? originTrack : track;
  const originTitle = radioTitle(origin?.title || origin?.name || "");
  const originArtist = radioText(
    origin?.radioSeedArtist || radioArtistIdentity(origin) || origin?.channel || origin?.artist || "",
    80,
  );
  const originSeed = radioText(origin?.seedQuery || contextName || "");
  const originGenre = radioText(origin?.genre || "");
  const currentTitle = radioTitle(track?.title || track?.name || "");

  const candidates = [
    originTitle && originArtist ? `${originTitle} ${originArtist} similar songs` : "",
    originSeed ? `${originSeed} similar songs` : "",
    originGenre && normalizeRadioArtist(originGenre) !== normalizeRadioArtist(originSeed)
      ? `${originGenre} similar music`
      : "",
    originArtist ? `${originArtist} similar artists songs` : "",
    currentTitle && currentTitle !== originTitle ? `${currentTitle} similar songs` : "",
  ];

  const seen = new Set();
  const queries = [];
  for (const candidate of candidates) {
    const value = radioText(candidate);
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    queries.push(value);
    if (queries.length >= Math.max(1, Math.min(6, Number(limit) || 4))) break;
  }
  return queries;
}

export function buildRadioSeedQuery({ id, artist = "" } = {}) {
  const videoId = String(id || "").trim();
  if (!VIDEO_ID_PATTERN.test(videoId)) return "";
  const artistText = String(artist || "")
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 56);
  return `${RADIO_SEED_PREFIX}${videoId}${artistText ? `|${artistText}` : ""}`;
}

export function parseRadioSeedQuery(value) {
  const text = String(value || "").trim();
  if (!text.startsWith(RADIO_SEED_PREFIX)) return null;
  const payload = text.slice(RADIO_SEED_PREFIX.length);
  const separator = payload.indexOf("|");
  const id = (separator >= 0 ? payload.slice(0, separator) : payload).trim();
  if (!VIDEO_ID_PATTERN.test(id)) return null;
  const artist = separator >= 0 ? payload.slice(separator + 1).trim().slice(0, 56) : "";
  return { id, artist };
}

export function preserveRadioReplacementMetadata(current, replacement) {
  if (!replacement || typeof replacement !== "object") return replacement;
  const seedQuery = radioText(current?.seedQuery || "", 200);
  const genre = radioText(current?.genre || "", 120);
  const radioSeedArtist = radioText(
    current?.radioSeedArtist || radioArtistIdentity(current) || current?.channel || current?.artist || "",
    200,
  );
  return {
    ...replacement,
    ...(seedQuery ? { seedQuery } : {}),
    ...(genre ? { genre } : {}),
    ...(radioSeedArtist ? { radioSeedArtist } : {}),
  };
}

export function retargetRadioPlaybackContext(context, currentId, replacementId) {
  if (!context || typeof context !== "object") return context;
  if (
    context.type !== "radio"
    || String(context.id || "") !== String(currentId || "")
    || !replacementId
  ) {
    return context;
  }
  return { ...context, id: String(replacementId).slice(0, 160) };
}

export function collectRadioArtistExclusions({
  history = [],
  current = null,
  upcoming = [],
  historyLimit = 6,
  upcomingLimit = 8,
} = {}) {
  const recentHistory = (Array.isArray(history) ? history : []).slice(
    -Math.max(0, Math.min(20, Number(historyLimit) || 0)),
  );
  const nextTracks = (Array.isArray(upcoming) ? upcoming : []).slice(
    0,
    Math.max(0, Math.min(20, Number(upcomingLimit) || 0)),
  );
  const seen = new Set();
  const artists = [];
  for (const track of [...recentHistory, current, ...nextTracks]) {
    const artist = radioArtistIdentity(track);
    if (!artist || seen.has(artist)) continue;
    seen.add(artist);
    artists.push(artist);
  }
  return artists;
}

export function diversifyRadioTracks(
  tracks,
  {
    seedArtist = "",
    excludeArtists = [],
    excludeTracks = [],
    limit = 24,
    maxPerArtist = 2,
    maxSeedArtist = 1,
    artistGap = 2,
  } = {},
) {
  const sourceArtist = normalizeRadioArtist(seedArtist);
  const excluded = new Set(
    (Array.isArray(excludeArtists) ? excludeArtists : [])
      .map((artist) => normalizeRadioArtist(artist))
      .filter(Boolean),
  );
  const unique = [];
  const seenIds = new Set();
  for (const track of Array.isArray(tracks) ? tracks : []) {
    const id = String(track?.id || "").trim();
    if (!VIDEO_ID_PATTERN.test(id) || seenIds.has(id)) continue;
    const artist = radioArtistIdentity(track);
    if (artist && excluded.has(artist)) continue;
    if ((Array.isArray(excludeTracks) ? excludeTracks : []).some((existing) => sameRadioSongFamily(existing, track))) continue;
    if (unique.some((existing) => sameRadioSongFamily(existing, track))) continue;
    seenIds.add(id);
    unique.push(track);
  }

  const remaining = unique.slice();
  const result = [];
  const counts = new Map();
  const recentArtists = [];
  const boundedLimit = Math.max(1, Math.min(50, Number(limit) || 24));
  const perArtist = Math.max(1, Math.min(5, Number(maxPerArtist) || 2));
  const seedArtistLimit = Math.max(0, Math.min(5, Number(maxSeedArtist) || 0));
  const gap = Math.max(0, Math.min(6, Number(artistGap) || 0));
  const artistLimit = (artist) => (
    sourceArtist && artist === sourceArtist ? seedArtistLimit : perArtist
  );

  while (remaining.length && result.length < boundedLimit) {
    let pick = remaining.findIndex((track) => {
      const artist = radioArtistIdentity(track);
      if (!artist) return true;
      return (counts.get(artist) || 0) < artistLimit(artist) && !recentArtists.includes(artist);
    });
    if (pick < 0) {
      pick = remaining.findIndex((track) => {
        const artist = radioArtistIdentity(track);
        return !artist || (counts.get(artist) || 0) < artistLimit(artist);
      });
    }
    if (pick < 0) break;

    const [chosen] = remaining.splice(pick, 1);
    result.push(chosen);
    const artist = radioArtistIdentity(chosen);
    if (artist) {
      counts.set(artist, (counts.get(artist) || 0) + 1);
      recentArtists.push(artist);
      while (recentArtists.length > gap) recentArtists.shift();
    }
  }

  return result;
}

export { RADIO_SEED_PREFIX };
