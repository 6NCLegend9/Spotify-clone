const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export function isYoutubeVideoId(value) {
  return VIDEO_ID.test(String(value || "").trim());
}

function cleanCommentText(value, max) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function sanitizeYoutubeComment(value) {
  if (!value || typeof value !== "object") return null;
  const text = cleanCommentText(value.text, 240);
  if (!text) return null;
  const likeCount = Number(value.likeCount);
  return {
    id: String(value.id || text).slice(0, 80),
    author: cleanCommentText(value.author, 48) || "Viewer",
    text,
    likeCount: Number.isFinite(likeCount) && likeCount > 0 ? Math.min(1_000_000, Math.round(likeCount)) : 0,
  };
}

export function sanitizeYoutubeComments(values) {
  const seen = new Set();
  const comments = [];
  for (const value of Array.isArray(values) ? values : []) {
    const comment = sanitizeYoutubeComment(value);
    if (!comment || seen.has(comment.id)) continue;
    seen.add(comment.id);
    comments.push(comment);
    if (comments.length >= 8) break;
  }
  return comments;
}
