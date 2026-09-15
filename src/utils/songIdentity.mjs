const FEATURE_MARKER = /\b(?:feat(?:uring)?|ft)\.?\b/i;
const MEDIA_SUFFIX = /\b(?:official\s*(?:music\s*)?video|official\s*audio|music\s*video|lyric(?:s)?(?:\s*video)?|visuali[sz]er|audio\s*only|movie\s*version|soundtrack\s*version|from\s+.+|remaster(?:ed)?|radio\s*edit|extended\s*(?:mix|version)|acoustic|live|instrumental|sped\s*up|slowed(?:\s*\+\s*reverb)?|clean\s*version|explicit\s*version|4k|uhd|hd)\b.*$/i;

function normalize(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeArtist(value) {
  return normalize(
    String(value || "")
      .replace(/\s*-\s*topic\s*$/i, "")
      .replace(/\bvevo\b\s*$/i, "")
      .replace(/\bofficial\s+(?:artist\s+)?channel\b\s*$/i, ""),
  );
}

function cleanSongSegment(value) {
  return normalize(
    String(value || "")
      .replace(/\([^)]*\)/g, " ")
      .replace(/\[[^\]]*\]/g, " ")
      .replace(/\{[^}]*\}/g, " ")
      .replace(/\b(?:feat(?:uring)?|ft)\.?\s+.*$/i, " ")
      .replace(MEDIA_SUFFIX, " "),
  );
}

function cleanArtistSegment(value) {
  return normalizeArtist(
    String(value || "")
      .replace(/\((?:[^)]*\b(?:official|video|audio|version|visuali[sz]er|soundtrack|movie|lyrics?|4k|uhd|hd)\b[^)]*)\)/gi, " ")
      .replace(/\[(?:[^\]]*\b(?:official|video|audio|version|visuali[sz]er|soundtrack|movie|lyrics?|4k|uhd|hd)\b[^\]]*)\]/gi, " ")
      .replace(MEDIA_SUFFIX, " "),
  );
}

/**
 * Produces a title-level identity for display grouping and diagnostics. Different
 * YouTube uploads of the same recording often have unrelated ids and media suffixes.
 */
export function canonicalSongTitle(track) {
  const raw = String(track?.title || track?.name || "").trim();
  if (!raw) return "";

  const parts = raw
    .replace(/[–—]/g, " - ")
    .split(/\s+(?:-|\|)\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 1) return cleanSongSegment(parts[0]);

  const channel = normalizeArtist(track?.channel || track?.channelTitle || track?.artist || "");
  const firstArtist = cleanArtistSegment(parts[0]);
  const secondArtist = cleanArtistSegment(parts[1]);

  // Handles "Song ft. Artist – Primary Artist" and "Song – Artist" uploads.
  if (FEATURE_MARKER.test(parts[0])) return cleanSongSegment(parts[0]);
  if (channel && secondArtist && (channel === secondArtist || channel.includes(secondArtist) || secondArtist.includes(channel))) {
    return cleanSongSegment(parts[0]);
  }

  // The overwhelmingly common YouTube music shape is "Artist - Song".
  // This also fixes soundtrack channels where the uploader is not the artist.
  if (firstArtist) return cleanSongSegment(parts[1]);
  return cleanSongSegment(parts[0]);
}

/**
 * Canonical recording identity for radio de-duplication. Artist is part of the
 * key so unrelated songs that share a title remain eligible recommendations.
 */
export function canonicalSongIdentity(track) {
  const title = canonicalSongTitle(track);
  if (!title) return "";
  const raw = String(track?.title || track?.name || "").replace(/[–—]/g, " - ");
  const parts = raw.split(/\s+(?:-|\|)\s+/).map((part) => part.trim()).filter(Boolean);
  const channel = normalizeArtist(track?.channel || track?.channelTitle || track?.artist || "");
  let artist = channel;
  if (parts.length > 1) {
    if (FEATURE_MARKER.test(parts[0])) {
      artist = cleanArtistSegment(parts[1]) || channel;
    } else {
      const second = cleanArtistSegment(parts[1]);
      artist = channel && second && (channel === second || channel.includes(second) || second.includes(channel))
        ? channel
        : cleanArtistSegment(parts[0]) || channel;
    }
  }
  return artist ? `${artist}|${title}` : title;
}
