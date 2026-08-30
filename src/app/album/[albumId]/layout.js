import { SITE_URL, SITE_NAME } from "@/utils/siteConfig";
import { resolveParams } from "@/utils/routeParams";

const siteUrl = SITE_URL;

async function getAlbumData(id) {
  return null;
}

export async function generateMetadata({ params }) {
  const { albumId } = await resolveParams(params);
  const albumData = await getAlbumData(albumId);

  if (!albumData) {
    return {
      title: "Album",
      description: "Listen to this album on Hayasaka",
    };
  }

  const albumName = albumData?.name || "Album";
  const artistNames = Array.isArray(albumData?.artists?.primary)
    ? albumData.artists.primary.map((a) => a?.name).join(", ")
    : albumData?.primaryArtists || "";
  const songCount = albumData?.songCount || 0;
  const year = albumData?.year || "";

  return {
    title: `${albumName} - ${artistNames}`,
    description: `Listen to ${albumName} by ${artistNames}. ${songCount} songs. Download and stream ${albumName} album for free on Hayasaka. Released in ${year}.`,
    keywords: [
      albumName,
      artistNames,
      `${albumName} album`,
      `${albumName} songs`,
      `${albumName} download`,
      `${artistNames} songs`,
      "album download",
      "free music",
    ],
    openGraph: {
      title: `${albumName} by ${artistNames} | Hayasaka`,
      description: `Listen to ${albumName} by ${artistNames}. ${songCount} songs. Stream and download for free.`,
      url: `${siteUrl}/album/${albumId}`,
      siteName: "Hayasaka",
      type: "music.album",
      images: albumData?.image?.[2]?.url
        ? [
            {
              url: albumData.image[2].url,
              width: 500,
              height: 500,
              alt: albumName,
            },
          ]
        : [],
    },
    twitter: {
      card: "summary_large_image",
      title: `${albumName} by ${artistNames} | Hayasaka`,
      description: `Listen to ${albumName} by ${artistNames}. ${songCount} songs. Stream and download for free.`,
      images: albumData?.image?.[2]?.url ? [albumData.image[2].url] : [],
    },
    alternates: {
      canonical: `${siteUrl}/album/${albumId}`,
    },
  };
}

export default function AlbumLayout({ children }) {
  return <>{children}</>;
}
