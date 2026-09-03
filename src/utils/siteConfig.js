// Single source of truth for SEO + metadata.
export const PRODUCTION_SITE_URL = "https://haykasa.vercel.app";

// Google Sign-In (OAuth) is disabled; the app uses email/password only.
// The Gmail SMTP mail system is unaffected by this flag.
export const GOOGLE_SIGN_IN_ENABLED = false;

export function normalizeAppUrl(value, { allowHttp = false } = {}) {
  const rawValue = String(value || "").trim();
  if (!rawValue) return "";

  try {
    const url = new URL(
      /^[a-z][a-z\d+.-]*:\/\//i.test(rawValue)
        ? rawValue
        : `https://${rawValue}`,
    );
    const isLocalHttp =
      allowHttp
      && url.protocol === "http:"
      && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);

    if (url.protocol !== "https:" && !isLocalHttp) return "";
    if (url.username || url.password) return "";

    return url.origin;
  } catch {
    return "";
  }
}

export const SITE_URL =
  normalizeAppUrl(process.env.NEXT_PUBLIC_APP_URL) ||
  normalizeAppUrl(process.env.NEXTAUTH_URL) ||
  PRODUCTION_SITE_URL;
export const SITE_NAME = "HeyKasa";
export const SITE_BRAND = "HeyKasa Music";
export const SITE_TAGLINE = "Free Music Streaming, MP3 Download & Playlists";

export const DEFAULT_TITLE = `${SITE_NAME} - ${SITE_TAGLINE}`;
export const DEFAULT_DESCRIPTION =
  "HeyKasa is a free music streaming platform. Listen songs in high quality. Download MP3, build playlists, follow artists, and discover new releases - all without paywalls.";

export const DEFAULT_KEYWORDS = [
  "HeyKasa",
  "HeyKasa music",
  "HeyKasa app",
  "music streaming",
  "free music streaming",
  "free music download",
  "mp3 download",
  "online music player",
  "listen songs online",
  "latest songs",
  "trending songs",
  "music playlists",
  "create playlist online",
  "music app",
  "high quality audio streaming",
];

export const OG_IMAGE = "/icon-512x512.png";
export const TWITTER_HANDLE = "@NCLegend44";

export const ORG_CONTACT_EMAIL = "NCLegend404@gmail.com";

// Used only when we need an absolute URL for image/og fields.
export const absoluteUrl = (path = "/") =>
  `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
