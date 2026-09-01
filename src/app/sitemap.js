import { SITE_URL } from "@/utils/siteConfig";

const POPULAR_SEARCH_TERMS = [
  // Brand boosters
  "HeyKasa",
  "HeyKasa music",
  "HeyKasa songs",
  // Categories
  "trending songs",
  "new songs",
  "new songs 2026",
  "latest english songs",
  "english songs",
  "lofi songs",
  "indie pop",
  // Moods
  "romantic songs",
  "sad songs",
  "party songs",
  "workout songs",
  "travel songs",
  "rain songs",
  "love songs",
  "breakup songs",
  // English-language artists
  "taylor swift",
  "ed sheeran",
  "the weeknd",
  "drake",
  "billie eilish",
  // Generic
  "download songs",
  "free music download",
  "stream music online",
];

export default function sitemap() {
  const now = new Date();

  const staticPages = [
    {
      url: SITE_URL,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${SITE_URL}/genres`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/library`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    },
  ];

  const searchPages = POPULAR_SEARCH_TERMS.map((term) => ({
    url: `${SITE_URL}/search/${encodeURIComponent(term)}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [...staticPages, ...searchPages];
}
