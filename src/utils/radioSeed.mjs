const RADIO_SEED_PREFIX = "__kasa_radio__:";
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

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

export function diversifyRadioTracks(
  tracks,
  {
    seedArtist = "",
    limit = 24,
    maxPerArtist = 2,
    maxSeedArtist = 1,
    artistGap = 2,
  } = {},
) {
  const sourceArtist = normalizeRadioArtist(seedArtist);
  const unique = [];
  const seenIds = new Set();
  for (const track of Array.isArray(tracks) ? tracks : []) {
    const id = String(track?.id || "").trim();
    if (!VIDEO_ID_PATTERN.test(id) || seenIds.has(id)) continue;
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
      const artist = normalizeRadioArtist(track?.channel || track?.artist || "");
      if (!artist) return true;
      return (counts.get(artist) || 0) < artistLimit(artist) && !recentArtists.includes(artist);
    });
    if (pick < 0) {
      pick = remaining.findIndex((track) => {
        const artist = normalizeRadioArtist(track?.channel || track?.artist || "");
        return !artist || (counts.get(artist) || 0) < artistLimit(artist);
      });
    }
    if (pick < 0) break;

    const [chosen] = remaining.splice(pick, 1);
    result.push(chosen);
    const artist = normalizeRadioArtist(chosen?.channel || chosen?.artist || "");
    if (artist) {
      counts.set(artist, (counts.get(artist) || 0) + 1);
      recentArtists.push(artist);
      while (recentArtists.length > gap) recentArtists.shift();
    }
  }

  return result;
}

export { RADIO_SEED_PREFIX };
