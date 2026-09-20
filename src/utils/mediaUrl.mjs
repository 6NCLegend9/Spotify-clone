const ALLOWED_MEDIA_HOSTS = new Set([
  "i.ytimg.com",
  "yt3.ggpht.com",
  "yt3.googleusercontent.com",
  "lh3.googleusercontent.com",
]);

export function allowlistedMediaUrl(value, { maxLength = 500 } = {}) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > maxLength) return "";
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" || url.username || url.password) return "";
    if (!ALLOWED_MEDIA_HOSTS.has(url.hostname.toLowerCase())) return "";
    return url.href.slice(0, maxLength);
  } catch {
    return "";
  }
}
