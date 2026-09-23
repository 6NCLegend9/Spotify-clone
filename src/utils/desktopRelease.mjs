const CHANNELS = new Set(["stable", "beta", "internal"]);
const RELEASE_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,180}$/;
const GITHUB_RELEASE_ROOT = "https://github.com/6NCLegend9/Spotify-clone/releases";
const GITHUB_RELEASE_TAGS = Object.freeze({
  stable: "desktop-latest",
  internal: "desktop-preview",
});

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

export function desktopGithubReleaseTag(channelValue) {
  const channel = normalizeDesktopReleaseChannel(channelValue);
  return channel ? GITHUB_RELEASE_TAGS[channel] || "" : "";
}

export function desktopGithubReleaseFileUrl(channelValue, fileValue) {
  const tag = desktopGithubReleaseTag(channelValue);
  const file = String(fileValue || "").trim();
  if (!tag || !RELEASE_FILE.test(file)) return "";
  return `${GITHUB_RELEASE_ROOT}/download/${encodeURIComponent(tag)}/${encodeURIComponent(file)}`;
}

export function desktopGithubReleasePageUrl(channelValue) {
  const tag = desktopGithubReleaseTag(channelValue);
  return tag ? `${GITHUB_RELEASE_ROOT}/tag/${encodeURIComponent(tag)}` : "";
}

export async function firstReachableDesktopUrl(urls, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== "function") return "";
  for (const candidate of Array.isArray(urls) ? urls : []) {
    const url = String(candidate || "").trim();
    if (!url) continue;
    try {
      const response = await fetchImpl(url, {
        method: "HEAD",
        redirect: "manual",
        cache: "no-store",
      });
      if (response?.ok || (response?.status >= 300 && response?.status < 400)) return url;
    } catch {
      // Try the next server-owned fallback.
    }
  }
  return "";
}
