// Single source of truth for SEO + metadata.
// If the domain ever changes again, update SITE_URL only.

export const SITE_URL = "https://spotify-clone-iota-pink.vercel.app";
export const SITE_NAME = "Hayasaka";
export const SITE_BRAND = "Hayasaka Music";
export const SITE_TAGLINE = "Free Music Streaming, MP3 Download & Playlists";

export const DEFAULT_TITLE = `${SITE_NAME} - ${SITE_TAGLINE}`;
export const DEFAULT_DESCRIPTION =
  "Hayasaka is a free music streaming platform. Listen songs in high quality. Download MP3, build playlists, follow artists, and discover new releases - all without paywalls.";

export const DEFAULT_KEYWORDS = [
  "hayasaka",
  "hayasaka music",
  "hayasaka app",
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
