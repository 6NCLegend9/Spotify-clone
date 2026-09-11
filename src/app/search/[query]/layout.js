import { SITE_URL, SITE_NAME } from "@/utils/siteConfig";
import { resolveParams } from "@/utils/routeParams";

const siteUrl = SITE_URL;

// Collapse case + whitespace + encoding variants to one canonical form so
// Encoded and spaced search URLs point at the same canonical URL.
function normalizeQuery(raw) {
  try {
    return decodeURIComponent(raw.replace(/\+/g, " "))
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  } catch {
    return raw.trim().toLowerCase();
  }
}

export async function generateMetadata({ params }) {
  const { query } = await resolveParams(params);
  const normalized = normalizeQuery(query || "");
  const display = normalized.replace(/\b\w/g, (c) => c.toUpperCase());
  const canonicalSlug = encodeURIComponent(normalized);
  const canonicalUrl = `${siteUrl}/search/${canonicalSlug}`;

  return {
    title: `${display} - Music Search`,
    description: `Search songs, artists and playlists matching ${display} on ${SITE_NAME}. Playback availability depends on the source.`,
    keywords: [
      normalized,
      `${normalized} songs`,
      `listen ${normalized} online`,
      `${normalized} music`,
      "stream songs",
    ],
    openGraph: {
      title: `${display} - Music Search | ${SITE_NAME}`,
      description: `Listen to ${display} songs online for free. Stream ${display} songs and stream high quality music.`,
      url: canonicalUrl,
      siteName: SITE_NAME,
      type: "website",
    },
    twitter: {
      card: "summary",
      title: `${display} - Music Search | ${SITE_NAME}`,
      description: `Listen to ${display} songs online for free. Stream ${display} songs and stream high quality music.`,
    },
    alternates: {
      canonical: canonicalUrl,
    },
    robots: { index: false, follow: true },
  };
}

export default function SearchLayout({ children }) {
  return <>{children}</>;
}
