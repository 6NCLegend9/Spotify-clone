import { SITE_URL } from "@/utils/siteConfig";

export default function robots() {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/library/playlist/", "/jam/", "/youtube-playlist/"],
        disallow: [
          "/api/",
          "/myPlaylists/",
          "/reset-password/",
          "/login",
          "/signup",
          "/verify-email/",
          "/settings",
          "/following",
          "/library",
          "/embed/",
          "/arcade",
        ],
      },
      {
        // Block AI scrapers that don't drive any indexing benefit
        userAgent: ["GPTBot", "CCBot", "anthropic-ai", "ClaudeBot"],
        disallow: "/",
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
