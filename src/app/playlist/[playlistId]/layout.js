import { SITE_URL } from "@/utils/siteConfig";
import { resolveParams } from "@/utils/routeParams";

const siteUrl = SITE_URL;

async function getPlaylistData(id) {
  return null;
}

export async function generateMetadata({ params }) {
  const { playlistId } = await resolveParams(params);
  const playlistData = await getPlaylistData(playlistId);

  if (!playlistData) {
    return {
      title: "Playlist",
      description: "Listen to this playlist on HeyKasa",
    };
  }

  const playlistName = playlistData?.name || "Playlist";
  const songCount = playlistData?.songCount || 0;
  const description = playlistData?.description || "";

  return {
    title: `${playlistName} - Playlist`,
    description: `Listen to ${playlistName} playlist. ${songCount} songs. ${description}. Stream and download all songs for free on HeyKasa.`,
    keywords: [
      playlistName,
      `${playlistName} playlist`,
      `${playlistName} songs`,
      "music playlist",
      "free playlist download",
      "stream playlist",
    ],
    openGraph: {
      title: `${playlistName} Playlist | HeyKasa`,
      description: `Listen to ${playlistName} playlist. ${songCount} songs. Stream and download for free.`,
      url: `${siteUrl}/playlist/${playlistId}`,
      siteName: "HeyKasa",
      type: "music.playlist",
      images: playlistData?.image?.[2]?.url
        ? [
            {
              url: playlistData.image[2].url,
              width: 500,
              height: 500,
              alt: playlistName,
            },
          ]
        : [],
    },
    twitter: {
      card: "summary_large_image",
      title: `${playlistName} Playlist | HeyKasa`,
      description: `Listen to ${playlistName} playlist. ${songCount} songs. Stream and download for free.`,
      images: playlistData?.image?.[2]?.url ? [playlistData.image[2].url] : [],
    },
    alternates: {
      canonical: `${siteUrl}/playlist/${playlistId}`,
    },
  };
}

export default function PlaylistLayout({ children }) {
  return <>{children}</>;
}
