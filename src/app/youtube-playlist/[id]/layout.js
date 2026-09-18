import { resolveParams } from "@/utils/routeParams";
import { youtubeFetch } from "@/utils/youtubeApi";
import { cleanTitle } from "@/utils/text";
import { kasaShareMetadata, shareArtUrl } from "@/utils/shareCard.mjs";

const PLAYLIST_ID_PATTERN = /^[A-Za-z0-9_-]{2,64}$/;

export async function generateMetadata({ params }) {
  const { id } = await resolveParams(params);
  const playlistId = String(id || "");
  const path = PLAYLIST_ID_PATTERN.test(playlistId)
    ? `/youtube-playlist/${playlistId}`
    : "/youtube-playlist";
  if (!PLAYLIST_ID_PATTERN.test(playlistId)) {
    return kasaShareMetadata({ title: "Playlist", path, indexable: false });
  }

  try {
    const { ok, data } = await youtubeFetch("playlists", {
      part: "snippet",
      id: playlistId,
      maxResults: "1",
    }, { next: { revalidate: 900 } });
    const snippet = ok ? data?.items?.[0]?.snippet : null;
    const title = cleanTitle(snippet?.title || "Playlist");
    const image = shareArtUrl(
      snippet?.thumbnails?.maxres?.url
      || snippet?.thumbnails?.high?.url
      || snippet?.thumbnails?.medium?.url
      || "",
    );
    return kasaShareMetadata({ title, path, image, indexable: true });
  } catch {
    return kasaShareMetadata({ title: "Playlist", path, indexable: true });
  }
}

export default function YouTubePlaylistLayout({ children }) {
  return children;
}
