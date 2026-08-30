import PlaylistDetail from "@/components/Library/PlaylistDetail";
import { resolveParams } from "@/utils/routeParams";

export default async function PlaylistPage({ params }) {
  const { playlistId } = await resolveParams(params);
  return <PlaylistDetail kind="playlist" playlistId={playlistId} />;
}
