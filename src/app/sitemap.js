import { SITE_URL } from "@/utils/siteConfig";

export default function sitemap() {
  return ["", "/search", "/privacy", "/terms", "/accessibility", "/dmca"].map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: path ? "monthly" : "weekly",
    priority: path ? 0.4 : 1,
  }));
}
