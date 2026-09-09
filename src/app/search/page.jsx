import BrowseAll from "@/components/Search/BrowseAll";
import { SITE_NAME } from "@/utils/siteConfig";

export const metadata = {
  title: `Search | ${SITE_NAME}`,
  description: `Browse genres and search songs, artists, and playlists on ${SITE_NAME}.`,
};

export default function SearchIndexPage() {
  return <BrowseAll />;
}
