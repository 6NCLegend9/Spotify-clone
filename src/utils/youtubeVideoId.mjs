const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export function isYoutubeVideoId(value) {
  return VIDEO_ID.test(String(value || "").trim());
}
