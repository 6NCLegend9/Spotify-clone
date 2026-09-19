import {
  SITE_NAME,
  SITE_URL,
  SOCIAL_IMAGE,
  absoluteUrl,
} from "./siteConfig.js";
import { isYoutubeVideoId } from "./youtubeComments.mjs";

export const LISTEN_ON_HEYKASA = "Listen on HayKasa";

const YTIMG =
  /^https:\/\/i(?:[0-9]+)?\.ytimg\.com\/(?:vi(?:_webp)?|an)\/[A-Za-z0-9_-]{11}\//i;
const YT_ART = /^https:\/\/yt3\.ggpht\.com\//i;
const LOCAL_ART = /^\/(?:haykasa-og\.png|icon-\d+x\d+\.png)$/;

export function youtubeShareArt(videoId) {
  const id = String(videoId || "").trim();
  if (!isYoutubeVideoId(id)) return absoluteUrl(SOCIAL_IMAGE);
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

export function shareArtUrl(value) {
  const raw = String(value || "").trim();
  if (YTIMG.test(raw) || YT_ART.test(raw)) return raw;
  if (LOCAL_ART.test(raw)) return absoluteUrl(raw);
  return absoluteUrl(SOCIAL_IMAGE);
}

export function kasaSharePath(path) {
  const relative = String(path || "/");
  return relative.startsWith("/") && !relative.startsWith("//") ? relative : "/";
}

export function kasaShareMetadata({
  title,
  path,
  image,
  indexable = true,
} = {}) {
  const safeTitle = String(title || SITE_NAME).trim().slice(0, 120) || SITE_NAME;
  const url = `${SITE_URL}${kasaSharePath(path)}`;
  const art = shareArtUrl(image);
  const description = LISTEN_ON_HEYKASA;
  return {
    title: safeTitle,
    description,
    openGraph: {
      type: "website",
      locale: "en_US",
      siteName: SITE_NAME,
      title: safeTitle,
      description,
      url,
      images: [{ url: art, alt: safeTitle }],
    },
    twitter: {
      card: "summary_large_image",
      title: safeTitle,
      description,
      images: [art],
    },
    alternates: { canonical: url },
    robots: indexable
      ? { index: true, follow: true }
      : { index: false, follow: false },
  };
}

export function privateShareMetadata() {
  return kasaShareMetadata({
    title: SITE_NAME,
    path: "/",
    image: SOCIAL_IMAGE,
    indexable: false,
  });
}

export function playlistListenUrl(playlistId) {
  return `${SITE_URL}/library/playlist/${encodeURIComponent(String(playlistId || ""))}`;
}

export function playlistEmbedUrl(playlistId) {
  return `${SITE_URL}/embed/playlist/${encodeURIComponent(String(playlistId || ""))}`;
}

export function playlistEmbedSnippet(playlistId) {
  const src = playlistEmbedUrl(playlistId);
  return `<iframe src="${src}" width="100%" height="360" style="border:0;border-radius:12px;overflow:hidden;background:#07121d" loading="lazy" title="${SITE_NAME} playlist" referrerpolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"></iframe>`;
}
