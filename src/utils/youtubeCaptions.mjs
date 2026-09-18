const MAX_CAPTION_LINES = 400;

export function captionLinesFromJson3(payload) {
  const events = Array.isArray(payload?.events) ? payload.events : [];
  const lines = [];
  for (const event of events) {
    if (!Array.isArray(event?.segs) || event.segs.length === 0) continue;
    const text = event.segs.map((segment) => String(segment?.utf8 || "")).join("").replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
    if (!text || text === "♪") continue;
    const time = Math.max(0, Number(event.tStartMs) || 0) / 1000;
    lines.push({ time, text });
    if (lines.length >= MAX_CAPTION_LINES) break;
  }
  return lines;
}

export function captionLinesFromVtt(value) {
  const blocks = String(value || "").replace(/\r\n/g, "\n").split(/\n\n+/);
  const lines = [];
  for (const block of blocks) {
    const match = block.match(/(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s+-->/);
    if (!match) continue;
    const text = block
      .split("\n")
      .filter((row) => row && !row.includes("-->") && !/^\d+$/.test(row.trim()) && !row.startsWith("WEBVTT"))
      .join(" ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;
    const time = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000;
    lines.push({ time, text });
    if (lines.length >= MAX_CAPTION_LINES) break;
  }
  return lines;
}

export function captionLinesFromTranscript(segments) {
  const lines = [];
  for (const segment of Array.isArray(segments) ? segments : []) {
    const start = Number(segment?.start_ms);
    const text = String(segment?.snippet?.toString?.() || segment?.snippet || "").replace(/\s+/g, " ").trim();
    if (!Number.isFinite(start) || !text) continue;
    lines.push({ time: Math.max(0, start) / 1000, text });
    if (lines.length >= MAX_CAPTION_LINES) break;
  }
  return lines;
}

export function pickCaptionTrack(tracks) {
  const list = (Array.isArray(tracks) ? tracks : [])
    .map((track) => ({
      ...track,
      base_url: track?.base_url || track?.baseUrl || "",
      language_code: track?.language_code || track?.languageCode || "",
      kind: track?.kind || "",
    }))
    .filter((track) => track.base_url);
  const english = list.filter((track) => String(track.language_code).toLowerCase().startsWith("en"));
  return english.find((track) => track.kind !== "asr")
    || english[0]
    || list.find((track) => track.kind !== "asr")
    || list[0]
    || null;
}

export function pickTimedTextTrack(xml) {
  const tracks = [...String(xml || "").matchAll(/<track\b([^>]*)>/gi)].map((match) => {
    const tag = match[1];
    return {
      lang: tag.match(/lang_code="([^"]+)"/i)?.[1] || "",
      kind: tag.match(/kind="([^"]+)"/i)?.[1] || "",
    };
  }).filter((track) => track.lang);
  return tracks.find((track) => track.lang.toLowerCase().startsWith("en") && track.kind !== "asr")
    || tracks.find((track) => track.lang.toLowerCase().startsWith("en"))
    || tracks[0]
    || null;
}

export function playerResponseFromWatchHtml(html) {
  const source = String(html || "");
  const marker = source.indexOf("ytInitialPlayerResponse");
  if (marker < 0) return null;
  const start = source.indexOf("{", marker);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  const limit = Math.min(source.length, start + 2_000_000);
  for (let index = start; index < limit; index += 1) {
    const character = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === "\"") inString = false;
      continue;
    }
    if (character === "\"") {
      inString = true;
      continue;
    }
    if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth !== 0) continue;
      try {
        const payload = JSON.parse(source.slice(start, index + 1));
        return payload && typeof payload === "object" ? payload : null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function captionTracksFromPlayerResponse(payload) {
  const tracks = payload?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!Array.isArray(tracks)) return [];
  return tracks.map((track) => ({
    base_url: String(track?.baseUrl || track?.base_url || ""),
    language_code: String(track?.languageCode || track?.language_code || ""),
    kind: String(track?.kind || ""),
  })).filter((track) => track.base_url);
}
