import BrowseAll from "@/components/Search/BrowseAll";
import { SITE_NAME } from "@/utils/siteConfig";

export const metadata = {
  title: "Search",
  description: `Discover hot playlists, fresh music, and mood-based mixes on ${SITE_NAME}.`,
};

export default function SearchIndexPage() {
  return <BrowseAll />;
}
