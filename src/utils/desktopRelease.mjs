const CHANNELS = new Set(["stable", "beta", "internal"]);
const RELEASE_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,180}$/;

export function normalizeDesktopReleaseChannel(value) {
  const channel = String(value || "").trim().toLowerCase();
  return CHANNELS.has(channel) ? channel : "";
}

export function desktopBlobBaseUrl(value) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return "";
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return "";
    if (!url.hostname.endsWith(".public.blob.vercel-storage.com")) return "";
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url.href.replace(/\/$/, "");
  } catch {
    return "";
  }
}

export function desktopReleaseFileUrl(baseValue, channelValue, fileValue) {
  const base = desktopBlobBaseUrl(baseValue);
  const channel = normalizeDesktopReleaseChannel(channelValue);
  const file = String(fileValue || "").trim();
  if (!base || !channel || !RELEASE_FILE.test(file)) return "";
  return `${base}/${encodeURIComponent(channel)}/${encodeURIComponent(file)}`;
}

export function desktopStableManifestUrl(baseValue) {
  return desktopReleaseFileUrl(baseValue, "stable", "release-manifest.json");
}
