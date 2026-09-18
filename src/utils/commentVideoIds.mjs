import { isYoutubeVideoId } from "./youtubeComments.mjs";

const WATCH_ID = /(?:youtube\.com\/watch\?(?:[^#\s]*&)?v=|youtu\.be\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/gi;

export function videoIdsMentionedInText(value) {
  const text = String(value || "");
  const ids = [];
  const seen = new Set();
  for (const match of text.matchAll(WATCH_ID)) {
    const id = match[1];
    if (!isYoutubeVideoId(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}
