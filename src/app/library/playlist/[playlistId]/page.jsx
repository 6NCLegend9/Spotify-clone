import PlaylistDetail from "@/components/Library/PlaylistDetail";

export default function PlaylistPage({ params }) {
  return <PlaylistDetail kind="playlist" playlistId={params.playlistId} />;
}