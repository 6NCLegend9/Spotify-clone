const JUNK =
  /\b(official(?:\s+music)?(?:\s+video|\s+audio)?|lyrics?(?:\s+video)?|visualizer|audio only|music video|lyric video|remaster(?:ed)?|topic|explicit|clean version|color coded|slowed|reverb|sped up|nightcore|vevo|hd|hq|4k|8k|mv)\b/gi;

export function decodeEntities(value = "") {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function cleanLyricText(value = "") {
  return decodeEntities(value)
    .replace(/[\(\[\{][^\)\]\}]{0,80}[\)\]\}]/g, " ")
    .replace(JUNK, " ")
    .replace(/[|•·]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseArtistAndTitle(title = "", channel = "") {
  const artistFromChannel = cleanLyricText(String(channel).replace(/\s*-\s*topic$/i, ""));
  const raw = decodeEntities(title);
  const parts = raw.split(/\s+[-–—]\s+/).map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const artist = cleanLyricText(parts[0]) || artistFromChannel;
    const track = cleanLyricText(parts.slice(1).join(" - "));
    return { artist, title: track || cleanLyricText(raw) };
  }
  return { artist: artistFromChannel, title: cleanLyricText(raw) || raw.trim() };
}

export function parseLrc(lrc = "") {
  const lines = [];
  String(lrc)
    .replace(/\r\n/g, "\n")
    .split("\n")
    .forEach((row) => {
      const stamps = [...row.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
      if (stamps.length === 0) return;
      const text = row.replace(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g, "").trim();
      if (!text || text === "♪") return;
      stamps.forEach((stamp) => {
        const minutes = Number(stamp[1]);
        const seconds = Number(stamp[2]);
        const fraction = stamp[3] ? Number(stamp[3].padEnd(3, "0")) / 1000 : 0;
        lines.push({ time: minutes * 60 + seconds + fraction, text });
      });
    });
  return lines.sort((left, right) => left.time - right.time);
}

export function plainToLines(plain = "") {
  return String(plain)
    .replace(/<br\s*\/?>/gi, "\n")
    .split("\n")
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text, index) => ({ time: index * 8, text, unsynced: true }));
}

export function activeLyricIndex(lines = [], time = 0) {
  if (!lines.length) return -1;
  let index = 0;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].time <= time + 0.08) index = i;
    else break;
  }
  return index;
}

export function pickBestLyrics(results = [], duration = 0) {
  if (!Array.isArray(results) || results.length === 0) return null;
  const scored = results.map((item) => {
    const hasSynced = Boolean(item.syncedLyrics);
    const durationDelta = duration > 0 && item.duration ? Math.abs(item.duration - duration) : 12;
    return { item, score: (hasSynced ? 100 : 0) + Math.max(0, 20 - durationDelta) };
  });
  scored.sort((left, right) => right.score - left.score);
  return scored[0]?.item || results[0];
}
