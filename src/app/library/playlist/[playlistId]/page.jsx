import PlaylistDetail from "@/components/Library/PlaylistDetail";
import { resolveParams } from "@/utils/routeParams";
import { kasaShareMetadata, youtubeShareArt } from "@/utils/shareCard.mjs";
import { loadPublicPlaylistShare } from "@/utils/publicPlaylistShare.mjs";

export async function generateMetadata({ params }) {
  const { playlistId } = await resolveParams(params);
  try {
    const playlist = await loadPublicPlaylistShare(playlistId);
    if (!playlist) {
      return kasaShareMetadata({
        title: "Playlist",
        path: "/",
        indexable: false,
      });
    }
    return kasaShareMetadata({
      title: playlist.name,
      path: `/library/playlist/${playlist.id}`,
      image: playlist.image || youtubeShareArt(playlist.songs[0]),
      indexable: true,
    });
  } catch {
    return kasaShareMetadata({
      title: "Playlist",
      path: "/",
      indexable: false,
    });
  }
}

export default async function PlaylistPage({ params }) {
  const { playlistId } = await resolveParams(params);
  return <PlaylistDetail kind="playlist" playlistId={playlistId} />;
}
